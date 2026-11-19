import { DAY_MS, HOUR_MS } from "../../lib/time/units";
import { oldestFeedDay } from "../feed/items";
import { FEED_WINDOW_MS } from "../shared/coarse-time";

/**
 * Rows whose time is up. Each table is pruned through the index named beside it in the baseline,
 * up to BATCH rows a run, all tables in one `db.batch()` (one round trip, never an `await` in a
 * loop): a run reads about as many rows as it deletes (D1 bills rows read), and a backlog is
 * cleared over the next hourly runs instead of one long one.
 */

const BATCH = 1000;

interface PruneTarget {
  table: string;
  /** The key a batch selects (the primary key). */
  key: string;
  /** The indexed column compared with the cutoff: an instant, or a local day ('YYYY-MM-DD'). */
  column: string;
  /** How long a row is kept past that instant (0: pruned when it is reached). */
  keepMs?: number;
  /** Instead of `now − keepMs`: the cutoff a row's column is at or before when it goes. */
  cutoff?: (now: number) => number | string;
  /** Why this table is read whole, for a table kept small without an index on `column` (cost C1). */
  fullScan?: string;
}

const TARGETS: PruneTarget[] = [
  // Spent or never used: valid 5 minutes.
  { table: "auth_challenges", key: "id", column: "expires_at" },
  // Released after 90 days.
  { table: "username_holds", key: "name_hash", column: "released_at" },
  // A refresh token row, live or rotated, is useless once expired; reuse is detected until then.
  { table: "sessions", key: "id", column: "expires_at" },
  // Username changes count toward the limit for 30 days (PUT /v1/me/profile).
  { table: "username_changes", key: "id", column: "changed_at", keepMs: 30 * DAY_MS },
  // The Feed deletes itself (P9, ADR 0007): a drive, or an unpublished drive's tombstone, an hour
  // after it left the 7 days; a tombstone is useless by then, since an older drive is not stored.
  { table: "drives", key: "trip_id", column: "ended_at", keepMs: FEED_WINDOW_MS + HOUR_MS },
  // Then the items too old to hold a drive in the window (their reactions cascade); after drives
  // in the batch, so no drive points at a deleted item.
  {
    table: "feed_items",
    key: "id",
    column: "local_date",
    cutoff: (now) => new Date(Date.parse(`${oldestFeedDay(now)}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10),
  },
];

export type PruneCounts = Record<string, number>;

export async function pruneExpired(db: D1Database, now: number): Promise<PruneCounts> {
  const results = await db.batch(
    TARGETS.map(({ table, key, column, keepMs = 0, cutoff, fullScan }) =>
      db
        .prepare(
          `DELETE FROM ${table} WHERE ${key} IN (SELECT ${key} FROM ${table} WHERE ${column} <= ? LIMIT ${BATCH})` +
            (fullScan === undefined ? "" : ` -- full scan: ${fullScan}`),
        )
        .bind(cutoff ? cutoff(now) : now - keepMs),
    ),
  );
  return Object.fromEntries(TARGETS.map(({ table }, i) => [table, results[i]?.meta.changes ?? 0]));
}

/** Job history older than this is dropped; enough to see what happened last month. */
export const JOB_RUN_RETENTION_MS = 30 * DAY_MS;

export async function pruneJobRuns(db: D1Database, jobs: readonly string[], now: number): Promise<number> {
  // One statement per job keeps each on job_runs_on_job (job, started_at DESC); one batch for all.
  const results = await db.batch(
    jobs.map((job) =>
      db.prepare("DELETE FROM job_runs WHERE job = ? AND started_at < ?").bind(job, now - JOB_RUN_RETENTION_MS),
    ),
  );
  return results.reduce((total, result) => total + result.meta.changes, 0);
}
