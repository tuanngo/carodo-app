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
/**
 * Tables written by every sign-in and refresh: a run takes more of them, so a busy hour's rows are
 * gone by the next runs (cost C10: bounded, and finished by the next run, never looped).
 */
const AUTH_BATCH = 5000;

/** How long a rotated or revoked session is kept: a reuse of its refresh token revokes the family until then. */
export const REVOKED_SESSION_KEEP_MS = 30 * DAY_MS;

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
  /** Rows a run deletes at most (BATCH by default). */
  batch?: number;
  /** Why this table is read whole, for a table kept small without an index on `column` (cost C1). */
  fullScan?: string;
}

const TARGETS: PruneTarget[] = [
  // Spent or never used: valid 5 minutes.
  { table: "auth_challenges", key: "id", column: "expires_at", batch: AUTH_BATCH },
  // Released after 90 days.
  { table: "username_holds", key: "name_hash", column: "released_at" },
  // A refresh token row, live or rotated, is useless once expired.
  { table: "sessions", key: "id", column: "expires_at", batch: AUTH_BATCH },
  // A rotated or revoked one 30 days after (sessions_on_revoked_at, a partial index the comparison
  // implies): reuse detection needs no longer, since every refresh also needs the key's assertion.
  { table: "sessions", key: "id", column: "revoked_at", keepMs: REVOKED_SESSION_KEEP_MS, batch: AUTH_BATCH },
  // Username changes count toward the limit for 30 days (PUT /v1/me/profile).
  { table: "username_changes", key: "id", column: "changed_at", keepMs: 30 * DAY_MS },
  // The Feed deletes itself (P9, ADR 0007): a drive, or an unpublished drive's tombstone, an hour
  // after it left the 7 days; a tombstone is useless by then, since an older drive is not stored.
  { table: "drives", key: "trip_id", column: "ended_at", keepMs: FEED_WINDOW_MS + HOUR_MS },
  // Then the items whose newest drive left the window, and those too old to hold one in it (their
  // reactions cascade); after drives in the batch. The second also takes items that never listed
  // a drive (hidden before it became visible).
  { table: "feed_items", key: "id", column: "last_ended_at", keepMs: FEED_WINDOW_MS + HOUR_MS },
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
    TARGETS.map(({ table, key, column, keepMs = 0, cutoff, batch = BATCH, fullScan }) =>
      db
        .prepare(
          `DELETE FROM ${table} WHERE ${key} IN (SELECT ${key} FROM ${table} WHERE ${column} <= ? LIMIT ${batch})` +
            (fullScan === undefined ? "" : ` -- full scan: ${fullScan}`),
        )
        .bind(cutoff ? cutoff(now) : now - keepMs),
    ),
  );
  const counts: PruneCounts = {};
  for (const [i, { table }] of TARGETS.entries())
    counts[table] = (counts[table] ?? 0) + (results[i]?.meta.changes ?? 0);
  return counts;
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
