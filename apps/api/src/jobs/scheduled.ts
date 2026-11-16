import { logEvent } from "../lib/observability/log";
import { uuidv7 } from "../lib/platform/ids";
import { MINUTE_MS } from "../lib/time/units";
import { eraseDeletedAccounts } from "../services/accounts/erase";
import { pruneExpired, pruneJobRuns } from "../services/jobs/prune";

/**
 * The Cron transport (wrangler.jsonc `triggers.crons`): each job runs under a lease in
 * `job_states`, so a slow run and the next trigger never overlap, and leaves a row in `job_runs`.
 * A failing job is logged and does not stop the others.
 */

const LEASE_MS = 10 * MINUTE_MS;

interface Job {
  name: string;
  run(env: Env, now: number): Promise<unknown>;
}

const JOBS: Job[] = [
  { name: "account.erase", run: (env, now) => eraseDeletedAccounts(env, now) },
  { name: "prune.expired", run: (env, now) => pruneExpired(env.DB, now) },
  {
    name: "prune.job_runs",
    run: (env, now) =>
      pruneJobRuns(
        env.DB,
        JOBS.map((job) => job.name),
        now,
      ),
  },
];

export const JOB_NAMES = JOBS.map((job) => job.name);

/** Every job at once: they are independent, and one failing never holds up or stops another. */
export async function runScheduled(env: Env, now: number): Promise<void> {
  const settled = await Promise.allSettled(JOBS.map((job) => runJob(env, job, now)));
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      logEvent("error", "job.crashed", { job: JOBS[i]?.name, error: String(outcome.reason) });
    }
  }
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
