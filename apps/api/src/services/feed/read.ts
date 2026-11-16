import { publicHour } from "../shared/coarse-time";
import { ok, type Result } from "../shared/result";
import { type FeedPosition, FIRST_POSITION, openCursor, sealCursor } from "./cursor";
import {
  type DriveRow,
  type FeedItem,
  feedItem,
  forReader,
  type ItemRow,
  type SharedItem,
  VISIBLE,
  WINDOW_MS,
} from "./items";

/**
 * Reading the Feed (contract `GET /v1/feed`, carodo-ios ADR 0007): one worldwide list of car
 * drives over 72 hours, an item per person and local day, newest first. The page is the same for
 * every reader, so it is computed once and cached (ADR 0008); a member's own part (their item,
 * their reaction) is laid over it afterwards from one indexed read.
 *
 * Pages are keyset on (`sort_hour`, `id`), the order of `feed_items_on_feed`, never an offset
 * (cost C1). Inside an hour items go by their random id, so the order tells no finer time.
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

/** A page's items, by `feed_items_on_feed`: ?1 the window's first hour, ?2 and ?3 the position. */
export const ITEMS_SQL = `SELECT i.id, i.account_id, i.sort_hour, a.username, a.display_as, a.show_vehicle
       FROM feed_items i JOIN accounts a ON a.id = i.account_id
       WHERE i.sort_hour IS NOT NULL AND i.sort_hour >= ?1 AND (i.sort_hour, i.id) < (?2, ?3)
         AND a.deleted_at IS NULL AND a.feed_opt_in = 1
       ORDER BY i.sort_hour DESC, i.id DESC LIMIT ${ITEMS + 1}`;

/** The page's drives, by `drives_on_item_id`: ?1 the items (JSON), ?2 the window's start. */
export const DRIVES_SQL = `SELECT d.item_id, d.trip_id, d.vehicle_make, d.vehicle_model, d.distance_m, d.elapsed_duration_s,
         d.drove_at, d.ended_at, d.part_of_day, d.weather, d.shape
       FROM drives d WHERE d.item_id IN (SELECT value FROM json_each(?1)) AND ${VISIBLE} AND d.ended_at >= ?2`;

/** The page's reaction counts, by the reactions' primary key: ?1 the items (JSON). */
export const COUNTS_SQL = `SELECT item_id, reaction, count(*) AS n FROM reactions
       WHERE item_id IN (SELECT value FROM json_each(?1)) GROUP BY item_id, reaction`;

/** The reader's own reactions on a page, by `reactions_on_account_id`: ?1 the reader, ?2 the items. */
export const MINE_SQL = `SELECT item_id, reaction FROM reactions
       WHERE account_id = ?1 AND item_id IN (SELECT value FROM json_each(?2))`;

export async function parseCursor(root: string, cursor: string | undefined): Promise<Result<FeedPosition>> {
  if (cursor === undefined || cursor === "") return ok(FIRST_POSITION);
  return openCursor(root, cursor);
}

/** The page as every reader sees it: three indexed reads in two round trips. */
export async function sharedPage(env: Env, position: FeedPosition, now: number): Promise<SharedPage> {
  const since = publicHour(now - WINDOW_MS);
  const { results: rows } = await env.DB.prepare(ITEMS_SQL)
    .bind(since, position.sortHour, position.itemId)
    .all<ItemRow>();
  const kept = rows.slice(0, ITEMS);
  if (kept.length === 0) return { items: [], nextCursor: null, hasMore: false };

  const ids = JSON.stringify(kept.map((row) => row.id));
  const [drives, counts] = await env.DB.batch<DriveRow | { item_id: string; reaction: string; n: number }>([
    env.DB.prepare(DRIVES_SQL).bind(ids, now - WINDOW_MS),
    env.DB.prepare(COUNTS_SQL).bind(ids),
  ]);
  const byItem = groupBy((drives?.results ?? []) as DriveRow[]);
  const reactions = new Map<string, Record<string, number>>();
  for (const row of (counts?.results ?? []) as { item_id: string; reaction: string; n: number }[]) {
    reactions.set(row.item_id, { ...reactions.get(row.item_id), [row.reaction]: row.n });
  }
  const items = kept.flatMap((row) => feedItem(row, byItem.get(row.id) ?? [], reactions.get(row.id) ?? {}, now) ?? []);

  // The cursor follows the last item read, kept or not, so a page left short never repeats one.
  const last = kept.at(-1) as ItemRow;
  const hasMore = rows.length > ITEMS;
  const nextCursor = hasMore ? await sealCursor(env.SECRET_KEY, { sortHour: last.sort_hour, itemId: last.id }) : null;
  return { items, nextCursor, hasMore };
}

/** The contract's page for a guest (null) or a member: their item marked, their reactions laid on. */
export async function readerPage(env: Env, shared: SharedPage, readerId: string | null): Promise<FeedPage> {
  let mine = new Map<string, string>();
  if (readerId !== null && shared.items.length > 0) {
    const { results } = await env.DB.prepare(MINE_SQL)
      .bind(readerId, JSON.stringify(shared.items.map((entry) => entry.item.id)))
      .all<{ item_id: string; reaction: string }>();
    mine = new Map(results.map((row) => [row.item_id, row.reaction]));
  }
  return {
    items: shared.items.map((entry) => forReader(entry, readerId, mine)),
    nextCursor: shared.nextCursor,
    hasMore: shared.hasMore,
  };
}

function groupBy(drives: DriveRow[]): Map<string, DriveRow[]> {
  const groups = new Map<string, DriveRow[]>();
  for (const drive of drives) groups.set(drive.item_id, [...(groups.get(drive.item_id) ?? []), drive]);
  return groups;
}
