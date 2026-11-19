import type { FeedClock } from "../shared/coarse-time";
import { ok, type Result } from "../shared/result";
import { type FeedPosition, FIRST_POSITION, openCursor, sealCursor } from "./cursor";
import {
  type DriveRow,
  type FeedItem,
  feedItem,
  forReader,
  type ItemRow,
  oldestFeedDay,
  type SharedItem,
  VISIBLE,
} from "./items";

/**
 * Reading the Feed (contract `GET /v1/feed`, carodo-ios ADR 0007): one worldwide list of car
 * drives over 7 days, an item per person and local day, newest first. The page is the same for
 * every reader in a quarter hour, so it is computed once and cached (ADR 0008); a member's own part
 * (their reactions, their drives others cannot see yet) is laid over it afterwards.
 *
 * Others see a drive from its `visible_at`, a quarter hour (P9, services/shared/coarse-time.ts), and
 * an item is placed by its newest such drive (`last_ended_at`, moved only at a quarter by
 * services/feed/release.ts), so a publish never moves or shows anything between quarters. Pages are
 * keyset on (`last_ended_at`, `id`), never an offset (cost C1); inside a quarter items go by their
 * random id, so the order tells no finer time.
 */

export const ITEMS = 20;

/** A page as every reader shares it, before a member's overlay. */
export interface SharedPage {
  items: SharedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Contract: the `GET /v1/feed` answer. */
export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

const ITEM_COLUMNS = "i.id, i.account_id, i.last_ended_at, a.username, a.display_as, a.show_vehicle";
const ITEM_JOIN = "feed_items i JOIN accounts a ON a.id = i.account_id";
const LIVE_ACCOUNT = "a.deleted_at IS NULL AND a.feed_opt_in = 1";

/** A page's items, by `feed_items_on_feed`: ?1 the window's start, ?2 and ?3 the position. */
export const ITEMS_SQL = `SELECT ${ITEM_COLUMNS} FROM ${ITEM_JOIN}
       WHERE i.last_ended_at IS NOT NULL AND i.last_ended_at >= ?1 AND (i.last_ended_at, i.id) < (?2, ?3)
         AND ${LIVE_ACCOUNT}
       ORDER BY i.last_ended_at DESC, i.id DESC LIMIT ${ITEMS + 1}`;

const DRIVE_COLUMNS = `d.item_id, d.trip_id, d.vehicle_make, d.vehicle_model, d.distance_m, d.elapsed_duration_s,
         d.ended_at, d.visible_at, d.part_of_day, d.weather, d.shape`;

/**
 * The items' drives others may see, by `drives_on_item_id`: ?1 the items (JSON), ?2 the window's
 * start, ?3 the quarter.
 */
export const DRIVES_SQL = `SELECT ${DRIVE_COLUMNS}
       FROM drives d WHERE d.item_id IN (SELECT value FROM json_each(?1)) AND ${VISIBLE}
         AND d.ended_at >= ?2 AND d.visible_at <= ?3`;

/** The page's reaction counts, by the reactions' primary key: ?1 the items (JSON). */
export const COUNTS_SQL = `SELECT item_id, reaction, count(*) AS n FROM reactions
       WHERE item_id IN (SELECT value FROM json_each(?1)) GROUP BY item_id, reaction`;

/** The reader's own reactions on a page, by `reactions_on_account_id`: ?1 the reader, ?2 the items. */
export const MINE_SQL = `SELECT item_id, reaction FROM reactions
       WHERE account_id = ?1 AND item_id IN (SELECT value FROM json_each(?2))`;

/**
 * The reader's own drives in the window, with their account's display choices, by
 * `drives_on_account_id`: ?1 the reader, ?2 the oldest local day an item on the Feed can have,
 * ?3 the window's start. A few days of one person's drives.
 */
export const OWN_SQL = `SELECT ${DRIVE_COLUMNS}, a.username, a.display_as, a.show_vehicle
       FROM drives d JOIN accounts a ON a.id = d.account_id
       WHERE d.account_id = ?1 AND d.local_date >= ?2 AND ${VISIBLE} AND d.item_id IS NOT NULL
         AND d.ended_at >= ?3 AND a.deleted_at IS NULL`;

/**
 * The reaction counts of the reader's items holding a drive others cannot see yet, by
 * `drives_on_account_id` and the reactions' primary key: ?1 the reader, ?2 the oldest local day,
 * ?3 the quarter.
 */
export const OWN_COUNTS_SQL = `SELECT item_id, reaction, count(*) AS n FROM reactions
       WHERE item_id IN (SELECT d.item_id FROM drives d WHERE d.account_id = ?1 AND d.local_date >= ?2
         AND d.visible_at > ?3 AND ${VISIBLE}) GROUP BY item_id, reaction`;

export async function parseCursor(root: string, cursor: string | undefined): Promise<Result<FeedPosition>> {
  if (cursor === undefined || cursor === "") return ok(FIRST_POSITION);
  return openCursor(root, cursor);
}

type Count = { item_id: string; reaction: string; n: number };

/** The page as every reader sees it in the quarter of `clock`: three indexed reads in two round trips. */
export async function sharedPage(env: Env, position: FeedPosition, clock: FeedClock): Promise<SharedPage> {
  const { results: rows } = await env.DB.prepare(ITEMS_SQL)
    .bind(clock.windowStart, position.key, position.itemId)
    .all<ItemRow>();
  const kept = rows.slice(0, ITEMS);
  if (kept.length === 0) return { items: [], nextCursor: null, hasMore: false };

  const ids = JSON.stringify(kept.map((row) => row.id));
  const [drives, counts] = await env.DB.batch<DriveRow | Count>([
    env.DB.prepare(DRIVES_SQL).bind(ids, clock.windowStart, clock.quarter),
    env.DB.prepare(COUNTS_SQL).bind(ids),
  ]);
  const byItem = groupBy((drives?.results ?? []) as DriveRow[]);
  const reactions = new Map<string, Record<string, number>>();
  for (const row of (counts?.results ?? []) as Count[]) {
    reactions.set(row.item_id, { ...reactions.get(row.item_id), [row.reaction]: row.n });
  }
  const items = kept.flatMap(
    (row) => feedItem(row, byItem.get(row.id) ?? [], reactions.get(row.id) ?? {}, clock.quarter) ?? [],
  );

  // The cursor follows the last item read, kept or not, so a page left short never repeats one.
  const last = kept.at(-1) as ItemRow;
  const hasMore = rows.length > ITEMS;
  const nextCursor = hasMore ? await sealCursor(env.SECRET_KEY, { key: last.last_ended_at, itemId: last.id }) : null;
  return { items, nextCursor, hasMore };
}

type OwnRow = DriveRow & Pick<ItemRow, "username" | "display_as" | "show_vehicle">;

/**
 * The contract's page for a guest (null) or a member: their reactions laid on, and their own items
 * as they see them, with the drives others cannot see yet (P9: their own drives at once). On the
 * first page an own item holding such a drive comes first; later pages leave it out. `shared` is
 * never changed: it is the page every other reader gets.
 */
export async function readerPage(
  env: Env,
  shared: SharedPage,
  readerId: string | null,
  clock: FeedClock,
  now: number,
  first: boolean,
): Promise<FeedPage> {
  if (readerId === null) {
    return { items: shared.items.map((entry) => entry.item), nextCursor: shared.nextCursor, hasMore: shared.hasMore };
  }
  const pageIds = shared.items.map((entry) => entry.item.id);
  const oldestDay = oldestFeedDay(now);
  const [mineResult, ownResult, ownCounts] = await env.DB.batch<{ item_id: string; reaction: string } | OwnRow | Count>(
    [
      env.DB.prepare(MINE_SQL).bind(readerId, JSON.stringify(pageIds)),
      env.DB.prepare(OWN_SQL).bind(readerId, oldestDay, clock.windowStart),
      env.DB.prepare(OWN_COUNTS_SQL).bind(readerId, oldestDay, clock.quarter),
    ],
  );
  const mine = new Map(
    ((mineResult?.results ?? []) as { item_id: string; reaction: string }[]).map((row) => [row.item_id, row.reaction]),
  );

  // The reader's items holding a drive others cannot see yet, rebuilt from all their drives.
  const ownDrives = (ownResult?.results ?? []) as OwnRow[];
  const pending = new Set(ownDrives.filter((drive) => drive.visible_at > clock.quarter).map((d) => d.item_id));
  const counts = new Map<string, Record<string, number>>();
  for (const row of (ownCounts?.results ?? []) as Count[]) {
    counts.set(row.item_id, { ...counts.get(row.item_id), [row.reaction]: row.n });
  }
  const own = new Map<string, SharedItem>();
  for (const [itemId, drives] of groupBy(ownDrives)) {
    if (!pending.has(itemId)) continue;
    const head = drives[0] as OwnRow;
    const row: ItemRow = { ...head, id: itemId, account_id: readerId, last_ended_at: 0 };
    const item = feedItem(row, drives, counts.get(itemId) ?? {}, now);
    if (item) own.set(itemId, item);
  }

  const onPage = new Set(pageIds);
  const pinned = first ? [...own.values()].filter((entry) => !onPage.has(entry.item.id)) : [];
  const entries = [
    ...pinned,
    // In place on the first page; on a later one it was pinned to the first already.
    ...shared.items.flatMap((entry) => {
      const mineToo = own.get(entry.item.id);
      if (!mineToo) return [entry];
      return first ? [mineToo] : [];
    }),
  ];
  return {
    items: entries.map((entry) => forReader(entry, readerId, mine)),
    nextCursor: shared.nextCursor,
    hasMore: shared.hasMore,
  };
}

function groupBy(drives: DriveRow[]): Map<string, DriveRow[]> {
  const groups = new Map<string, DriveRow[]>();
  for (const drive of drives) groups.set(drive.item_id, [...(groups.get(drive.item_id) ?? []), drive]);
  return groups;
}
