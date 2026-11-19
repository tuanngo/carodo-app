import { logEvent } from "../lib/observability/log";
import { uuidv7 } from "../lib/platform/ids";
import { MINUTE_MS } from "../lib/time/units";
import { eraseDeletedAccounts } from "../services/accounts/erase";
import { releaseFeed } from "../services/feed/release";
import { pruneExpired, pruneJobRuns } from "../services/jobs/prune";
import { FEED_WINDOW_MS, feedClock } from "../services/shared/coarse-time";

/**
 * The Cron transport (wrangler.jsonc `triggers.crons`): each job runs under a lease in
 * `job_states`, so a slow run and the next trigger never overlap, and leaves a row in `job_runs`.
 * A failing job is logged and does not stop the others. Two schedules: the hourly jobs, and the
 * Feed's release at every quarter hour.
 */

/** wrangler.jsonc: every hour at :17, away from the quarters. */
export const HOURLY_CRON = "17 * * * *";
/** wrangler.jsonc: at every quarter hour, when drives become visible to others. */
export const FEED_CRON = "*/15 * * * *";

const LEASE_MS = 10 * MINUTE_MS;

interface Job {
  name: string;
  cron: string;
  run(env: Env, now: number): Promise<unknown>;
}

const JOBS: Job[] = [
  { name: "account.erase", cron: HOURLY_CRON, run: (env, now) => eraseDeletedAccounts(env, now) },
  { name: "prune.expired", cron: HOURLY_CRON, run: (env, now) => pruneExpired(env.DB, now) },
  { name: "feed.release", cron: FEED_CRON, run: (env, now) => releaseDue(env.DB, now) },
  {
    name: "prune.job_runs",
    cron: HOURLY_CRON,
    run: (env, now) =>
      pruneJobRuns(
        env.DB,
        JOBS.map((job) => job.name),
        now,
      ),
  },
];

export const JOB_NAMES = JOBS.map((job) => job.name);

/**
 * Every job of `cron` at once: they are independent, and one failing never holds up or stops
 * another. An unknown schedule (a trigger fired by hand) runs the hourly jobs.
 */
export async function runScheduled(env: Env, now: number, cron = HOURLY_CRON): Promise<void> {
  const due = JOBS.filter((job) => job.cron === (cron === FEED_CRON ? FEED_CRON : HOURLY_CRON));
  const settled = await Promise.allSettled(due.map((job) => runJob(env, job, now)));
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      logEvent("error", "job.crashed", { job: due[i]?.name, error: String(outcome.reason) });
    }
  }
}

/**
 * The Feed's release from the last quarter done (`job_states.cursor`) to this one; the cursor
 * moves only when every drive up to this quarter is listed, so a missed or partial run is caught
 * up by the next. The first run starts a window back.
 */
async function releaseDue(db: D1Database, now: number): Promise<unknown> {
  const { quarter } = feedClock(now);
  const state = await db
    .prepare("SELECT cursor FROM job_states WHERE job = 'feed.release'")
    .first<{ cursor: string | null }>();
  const from = state?.cursor ? Number(state.cursor) : quarter - FEED_WINDOW_MS;
  if (from >= quarter) return { items: 0, done: true, rowsRead: 0 };
  const result = await releaseFeed(db, from, quarter);
  if (result.done) {
    await db.prepare("UPDATE job_states SET cursor = ? WHERE job = 'feed.release'").bind(String(quarter)).run();
  }
  return result;
}

async function runJob(env: Env, job: Job, now: number): Promise<void> {
  if (!(await acquireLease(env.DB, job.name, now))) {
    logEvent("info", "job.skipped", { job: job.name, reason: "leased" });
    return;
  }
  const runId = uuidv7(now);
  await env.DB.prepare("INSERT INTO job_runs (id, job, started_at, status) VALUES (?, ?, ?, 'running')")
    .bind(runId, job.name, now)
    .run();
  let status: "ok" | "failed" = "ok";
  let detail: unknown;
  try {
    detail = await job.run(env, now);
  } catch (error) {
    status = "failed";
    detail = { error: error instanceof Error ? error.message : String(error) };
  }
  const finishedAt = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE job_runs SET finished_at = ?, status = ?, detail = ? WHERE id = ?").bind(
      finishedAt,
      status,
      JSON.stringify(detail ?? null),
      runId,
    ),
    env.DB.prepare("UPDATE job_states SET lease_until = NULL, updated_at = ? WHERE job = ?").bind(finishedAt, job.name),
  ]);
  logEvent(status === "ok" ? "info" : "error", "job.finished", { job: job.name, status, detail });
}

/** Takes the job's lease unless another run holds one that has not expired. */
async function acquireLease(db: D1Database, job: string, now: number): Promise<boolean> {
  const { meta } = await db
    .prepare(
      `INSERT INTO job_states (job, lease_until, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (job) DO UPDATE SET lease_until = excluded.lease_until, updated_at = excluded.updated_at
       WHERE job_states.lease_until IS NULL OR job_states.lease_until <= ?`,
    )
    .bind(job, now + LEASE_MS, now, now)
    .run();
  return meta.changes === 1;
}
