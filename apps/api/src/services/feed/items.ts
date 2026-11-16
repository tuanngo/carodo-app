import { DAY_MS, HOUR_MS } from "../../lib/time/units";
import { agoBucket } from "../shared/coarse-time";

/**
 * Feed items (contract `FeedItem`, carodo-ios ADR 0007): one person's car drives on their local
 * day. An item's id is random and kept for its life, so reactions stay on it when a drive joins or
 * leaves; no response carries an author id, a route, a place, a start, an end or an exact time.
 * `feed_items.sort_hour` is the hour its newest visible drive ended, the only order readers see.
 */

/** The Feed shows drives from the last 72 hours (ADR 0007). */
export const WINDOW_MS = 72 * HOUR_MS;

/** A visible drive: not unpublished, not taken off by Stop sharing, not hidden. `d` is drives. */
export const VISIBLE = "d.hidden_at IS NULL AND d.unpublished_at IS NULL AND d.stopped_at IS NULL";

/**
 * Recomputes the items `where` selects (`feed_items` columns, bound to `values`) from their
 * visible drives, in one statement: `last_ended_at` and `sort_hour` together, NULL when none is
 * left. Each item reads its drives through `drives_on_item_id`. In a batch after a write that may
 * change nothing (a retry, an older revision), `where` starts with `changes() = 1`: the refresh then
 * writes no row either (cost C3).
 */
function refreshItems(db: D1Database, where: string, values: unknown[]): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE feed_items SET (last_ended_at, sort_hour) = (
         SELECT max(d.ended_at), max(d.ended_at) - max(d.ended_at) % ${HOUR_MS}
         FROM drives d WHERE d.item_id = feed_items.id AND ${VISIBLE})
       WHERE ${where}`,
    )
    .bind(...values);
}

/**
 * After a publish, in its batch right after the drive's upsert: the drive's item, and the account's
 * other recent items (a new revision may move the drive to another day). An item older than the
 * window's days is off the Feed either way.
 */
export function refreshAfterPublish(db: D1Database, accountId: string, localDate: string, now: number) {
  // A local day is at most 14 hours from UTC; four days back covers 72 hours in any zone.
  const since = new Date(now - 4 * DAY_MS).toISOString().slice(0, 10);
  return refreshItems(db, "changes() = 1 AND account_id = ?1 AND (local_date = ?2 OR local_date >= ?3)", [
    accountId,
    localDate,
    since,
  ]);
}

/** After an unpublish, in its batch right after the tombstone's upsert: the drive's item. */
export function refreshItemOfTrip(db: D1Database, tripId: string) {
  return refreshItems(db, "changes() = 1 AND id = (SELECT item_id FROM drives WHERE trip_id = ?1)", [tripId]);
}

/**
 * After Stop sharing or a deletion: every item of the account still on the Feed (one only ever
 * leaves it here, so items already off it are not read again).
 */
export function refreshItemsOf(db: D1Database, accountId: string): D1PreparedStatement[] {
  return [refreshItems(db, "account_id = ?1 AND sort_hour IS NOT NULL", [accountId])];
}

/** An item as a Feed page query reads it, with its author's display choices at read time. */
export interface ItemRow {
  id: string;
  account_id: string;
  sort_hour: number;
  username: string;
  display_as: string;
  show_vehicle: number;
}

/** A drive as a Feed page query reads it. */
export interface DriveRow {
  item_id: string;
  trip_id: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  distance_m: number;
  elapsed_duration_s: number;
  drove_at: number;
  /** Exact: only ever turned into an age (never in a response). */
  ended_at: number;
  part_of_day: string;
  weather: string | null;
  shape: string | null;
}

export interface VehicleLabel {
  make: string | null;
  model: string | null;
}

export interface FeedDrive {
  durationS: number;
  distanceM: number;
  ago: string;
  partOfDay: string;
  /** Present only when the device reported rain. */
  weather?: "rain";
  shape?: { version: 1; points: number[][] } | null;
}

/** Contract `FeedItem`, as every reader sees it. */
export interface FeedItem {
  id: string;
  isAuthor: boolean;
  /** Only on the reader's own item. */
  tripIds?: string[];
  displayName: string | null;
  vehicle: VehicleLabel | null;
  drives: FeedDrive[];
  totalDurationS: number;
  totalDistanceM: number;
  ago: string;
  reactions: Record<string, number>;
  myReaction: string | null;
}

/**
 * An item as the shared page keeps it: the contract's item for a guest, plus what a member's own
 * overlay needs (who wrote it, its trips). Never sent as it is.
 */
export interface SharedItem {
  item: FeedItem;
  authorId: string;
  tripIds: string[];
}

/** One item from its row and its drives (newest first); null when none of its drives is left. */
export function feedItem(
  row: ItemRow,
  drives: readonly DriveRow[],
  reactions: Record<string, number>,
  now: number,
): SharedItem | null {
  const sorted = [...drives].sort((a, b) => b.ended_at - a.ended_at || a.trip_id.localeCompare(b.trip_id));
  const newest = sorted[0];
  if (!newest) return null;
  const feedDrives = sorted.map(
    (drive): FeedDrive => ({
      durationS: drive.elapsed_duration_s,
      distanceM: drive.distance_m,
      ago: agoBucket(drive.drove_at, now, drive.ended_at),
      partOfDay: drive.part_of_day,
      ...(drive.weather === "rain" ? { weather: "rain" as const } : {}),
      ...(drive.shape === null ? {} : { shape: JSON.parse(drive.shape) as FeedDrive["shape"] }),
    }),
  );
  return {
    authorId: row.account_id,
    tripIds: sorted.map((drive) => drive.trip_id).sort(),
    item: {
      id: row.id,
      isAuthor: false,
      displayName: row.display_as === "username" ? row.username : null,
      vehicle: row.show_vehicle === 1 ? { make: newest.vehicle_make, model: newest.vehicle_model } : null,
      drives: feedDrives,
      totalDurationS: feedDrives.reduce((sum, drive) => sum + drive.durationS, 0),
      totalDistanceM: feedDrives.reduce((sum, drive) => sum + drive.distanceM, 0),
      ago: agoBucket(newest.drove_at, now, newest.ended_at),
      reactions,
      myReaction: null,
    },
  };
}

/** The item a reader sees: their own carries "You" and its trips; their reaction from `mine`. */
export function forReader(shared: SharedItem, readerId: string | null, mine: ReadonlyMap<string, string>): FeedItem {
  if (readerId === null) return shared.item;
  const own = shared.authorId === readerId;
  return {
    ...shared.item,
    isAuthor: own,
    ...(own ? { tripIds: shared.tripIds } : {}),
    myReaction: mine.get(shared.item.id) ?? null,
  };
}
