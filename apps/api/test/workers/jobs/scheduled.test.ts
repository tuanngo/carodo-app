import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../../../src/index";
import { FEED_CRON, runScheduled } from "../../../src/jobs/scheduled";
import { blobKeys } from "../../../src/lib/storage/keys";
import { eraseDeletedAccounts } from "../../../src/services/accounts/erase";
import { isUsernameHeld } from "../../../src/services/accounts/usernames";
import { attestDevice } from "../../support/app-client.ts";
import { driveInput } from "../../support/drives.ts";
import { seedDay, seedDriver } from "../../support/feed.ts";

const HOUR = 60 * 60 * 1000;

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql)
    .bind(...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** A deleted account made through the API, with a published drive, a reaction given and one received. */
async function deletedAccount() {
  const phone = await attestDevice(env.APP_ID);
  const username = `erase_${crypto.randomUUID().slice(0, 8)}`;
  const claim = await phone.send(
    "POST",
    "/v1/accounts",
    {
      username,
      deviceCheckToken: "dc",
      sharing: { sharing: true, displayAs: "username", showVehicle: true },
    },
    { authorization: `Bearer ${phone.guestToken}` },
  );
  const { profile, session } = await claim.json<{ profile: { id: string }; session: { accessToken: string } }>();
  const published = await phone.send("PUT", `/v1/feed/drives/${crypto.randomUUID()}`, driveInput(), {
    authorization: `Bearer ${session.accessToken}`,
  });
  if (published.status !== 204) throw new Error(`publish: ${published.status}`);
  const own = await env.DB.prepare("SELECT id FROM feed_items WHERE account_id = ?")
    .bind(profile.id)
    .first<{ id: string }>();
  const other = await seedDriver();
  const theirs = await seedDay(other.id, new Date().toISOString().slice(0, 10), [Date.now() - HOUR]);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO reactions (item_id, account_id, reaction, created_at) VALUES (?, ?, 'fire', 0)").bind(
      own?.id,
      other.id,
    ),
    env.DB.prepare("INSERT INTO reactions (item_id, account_id, reaction, created_at) VALUES (?, ?, 'road', 0)").bind(
      theirs,
      profile.id,
    ),
  ]);
  const deleted = await phone.send("DELETE", "/v1/account", undefined, {
    authorization: `Bearer ${session.accessToken}`,
  });
  if (deleted.status !== 204) throw new Error(`delete: ${deleted.status}`);
  return { id: profile.id, username, itemId: own?.id };
}

describe("account.erase", () => {
  it("erases every row about a deleted account and keeps only the username hold", async () => {
    const account = await deletedAccount();
    await runScheduled(env, Date.now());

    expect(await count("SELECT COUNT(*) AS n FROM accounts WHERE id = ?", account.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM sessions WHERE account_id = ?", account.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM drives WHERE account_id = ?", account.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM feed_items WHERE account_id = ?", account.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM reactions WHERE account_id = ?", account.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM reactions WHERE item_id = ?", account.itemId)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM pending_ops WHERE target = ?", account.id)).toBe(0);
    expect(await isUsernameHeld(env, account.username, Date.now())).toBe(true);
  });

  // The cascade from `accounts` (baseline): any table with an `account_id` column must be emptied
  // of the account, so a new table created without its foreign key fails here.
  it("leaves no row of the account in any table that has an account_id column", async () => {
    const account = await deletedAccount();
    await env.DB.prepare("INSERT INTO username_changes (id, account_id, changed_at) VALUES (?, ?, ?)")
      .bind(crypto.randomUUID(), account.id, Date.now())
      .run();
    await runScheduled(env, Date.now());

    const { results: tables } = await env.DB.prepare(
      `SELECT m.name FROM sqlite_master m JOIN pragma_table_info(m.name) c ON c.name = 'account_id'
       WHERE m.type = 'table'`,
    ).all<{ name: string }>();
    expect(tables.map((table) => table.name).sort()).toEqual([
      "drives",
      "feed_items",
      "reactions",
      "sessions",
      "username_changes",
    ]);
    for (const { name } of tables) {
      expect(await count(`SELECT COUNT(*) AS n FROM ${name} WHERE account_id = ?`, account.id), name).toBe(0);
    }
  });

  it("never erases an account that is not deleted", async () => {
    const phone = await attestDevice(env.APP_ID);
    const claim = await phone.send(
      "POST",
      "/v1/accounts",
      {
        username: `kept_${crypto.randomUUID().slice(0, 8)}`,
        deviceCheckToken: "dc",
      },
      { authorization: `Bearer ${phone.guestToken}` },
    );
    const { profile } = await claim.json<{ profile: { id: string } }>();
    // Owed work naming a live account (a bug elsewhere) must not erase it.
    await env.DB.prepare(
      "INSERT INTO pending_ops (id, kind, target, next_attempt_at, created_at) VALUES (?, 'account.erase', ?, 0, 0)",
    )
      .bind(crypto.randomUUID(), profile.id)
      .run();
    await runScheduled(env, Date.now());
    expect(await count("SELECT COUNT(*) AS n FROM accounts WHERE id = ?", profile.id)).toBe(1);
  });
});

it("postpones the whole run when erasing fails, each item by its own backoff", async () => {
  const account = await deletedAccount();
  const now = Date.now();
  // A database whose batch fails, as a transaction that rolled back would.
  const failing = new Proxy(env.DB, {
    get(target, property) {
      if (property === "batch") return async () => Promise.reject(new Error("rolled back"));
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  expect(await eraseDeletedAccounts({ ...env, DB: failing }, now)).toMatchObject({ erased: 0 });
  const owed = await env.DB.prepare("SELECT attempts, next_attempt_at FROM pending_ops WHERE target = ?")
    .bind(account.id)
    .first<{ attempts: number; next_attempt_at: number }>();
  expect(owed?.attempts).toBe(1);
  expect(owed?.next_attempt_at).toBe(now + 60_000);
  expect(await count("SELECT COUNT(*) AS n FROM accounts WHERE id = ?", account.id)).toBe(1);

  // The next run after the backoff erases it.
  expect(await eraseDeletedAccounts(env, now + 60_000)).toMatchObject({ failed: 0 });
  expect(await count("SELECT COUNT(*) AS n FROM accounts WHERE id = ?", account.id)).toBe(0);
});

it("erases the account's objects in R2 before its rows, and nobody else's", async () => {
  const gone = await deletedAccount();
  const kept = crypto.randomUUID();
  await Promise.all([
    env.BLOBS.put(blobKeys.backup(gone.id, crypto.randomUUID(), 1), "ciphertext"),
    env.BLOBS.put(blobKeys.avatar(gone.id, crypto.randomUUID()), "photo"),
    env.BLOBS.put(blobKeys.backup(kept, crypto.randomUUID(), 1), "someone else's"),
  ]);

  const counts = await eraseDeletedAccounts(env, Date.now());
  expect(counts).toMatchObject({ failed: 0, pending: 0 });
  expect(counts.erased).toBeGreaterThanOrEqual(1);

  expect((await env.BLOBS.list({ prefix: `backups/${gone.id}/` })).objects).toHaveLength(0);
  expect((await env.BLOBS.list({ prefix: `avatars/${gone.id}/` })).objects).toHaveLength(0);
  expect((await env.BLOBS.list({ prefix: `backups/${kept}/` })).objects).toHaveLength(1);
});

describe("prune.expired", () => {
  it("deletes what has expired and nothing else", async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO auth_challenges (id, expires_at) VALUES ('old-challenge', ?), ('new-challenge', ?)",
      ).bind(now - 1, now + HOUR),
      env.DB.prepare("INSERT INTO username_holds (name_hash, released_at) VALUES ('released', ?), ('held', ?)").bind(
        now - 1,
        now + HOUR,
      ),
    ]);
    await runScheduled(env, now);
    const challenges = await env.DB.prepare(
      "SELECT id FROM auth_challenges WHERE id IN ('old-challenge', 'new-challenge')",
    ).all();
    expect(challenges.results).toEqual([{ id: "new-challenge" }]);
    const holds = await env.DB.prepare(
      "SELECT name_hash FROM username_holds WHERE name_hash IN ('released', 'held')",
    ).all();
    expect(holds.results).toEqual([{ name_hash: "held" }]);
  });

  it("deletes drives, tombstones and items once they leave the 7-day Feed, reactions with them", async () => {
    const now = Date.now();
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const [gone, kept] = await Promise.all([seedDriver(), seedDriver()]);
    const oldItem = await seedDay(gone.id, day(now - 8 * 24 * HOUR), [now - 169 * HOUR]);
    const keptItem = await seedDay(kept.id, day(now - 8 * 24 * HOUR), [now - 167 * HOUR]);
    const tombstones = [crypto.randomUUID(), crypto.randomUUID()];
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO drives (trip_id, account_id, distance_m, moving_duration_s, elapsed_duration_s, ended_at,
           visible_at, local_date, revision, published_at, updated_at, unpublished_at)
         VALUES (?1, ?3, 0, 0, 0, ?4, ?4, '', 1, 0, 0, 0), (?2, ?3, 0, 0, 0, ?5, ?5, '', 1, 0, 0, 0)`,
      ).bind(tombstones[0], tombstones[1], kept.id, now - 169 * HOUR, now - 167 * HOUR),
      env.DB.prepare("INSERT INTO reactions (item_id, account_id, reaction, created_at) VALUES (?, ?, 'fire', 0)").bind(
        oldItem,
        kept.id,
      ),
    ]);

    await runScheduled(env, now);

    expect(await count("SELECT count(*) AS n FROM drives WHERE account_id = ?", gone.id)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM feed_items WHERE id = ?", oldItem)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM reactions WHERE item_id = ?", oldItem)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM drives WHERE trip_id = ?", tombstones[0])).toBe(0);
    expect(await count("SELECT count(*) AS n FROM drives WHERE trip_id = ?", tombstones[1])).toBe(1);
    expect(await count("SELECT count(*) AS n FROM drives WHERE item_id = ?", keptItem)).toBe(1);
    expect(await count("SELECT count(*) AS n FROM feed_items WHERE id = ?", keptItem)).toBe(1);
  });
});

describe("feed.release", () => {
  it("shows others a drive at its quarter, on its own cron, and only on it", async () => {
    const driver = await seedDriver();
    const quarter = Date.now() - (Date.now() % (15 * 60 * 1000)) + 15 * 60 * 1000;
    const itemId = await seedDay(driver.id, new Date(quarter).toISOString().slice(0, 10), [quarter - HOUR]);
    // Published late: others may see it from the next quarter, and its item does not list it yet.
    await env.DB.batch([
      env.DB.prepare("UPDATE drives SET visible_at = ? WHERE item_id = ?").bind(quarter, itemId),
      env.DB.prepare("UPDATE feed_items SET last_ended_at = NULL WHERE id = ?").bind(itemId),
    ]);
    const listed = () =>
      count("SELECT count(*) AS n FROM feed_items WHERE id = ? AND last_ended_at IS NOT NULL", itemId);

    await runScheduled(env, quarter - 1, FEED_CRON);
    expect(await listed()).toBe(0);
    await runScheduled(env, quarter + 3 * 60 * 1000);
    expect(await listed()).toBe(0);
    await runScheduled(env, quarter, FEED_CRON);
    expect(await listed()).toBe(1);
  });
});

describe("leases and history", () => {
  it("skips a job another run still holds, and records each run", async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO job_states (job, lease_until, updated_at) VALUES ('prune.expired', ?, ?)
         ON CONFLICT (job) DO UPDATE SET lease_until = excluded.lease_until`,
      ).bind(now + HOUR, now),
      env.DB.prepare("INSERT INTO auth_challenges (id, expires_at) VALUES ('leased-challenge', ?)").bind(now - 1),
    ]);
    await runScheduled(env, now);
    expect(await count("SELECT COUNT(*) AS n FROM auth_challenges WHERE id = 'leased-challenge'")).toBe(1);

    // Once the lease has run out, the next trigger takes it.
    await runScheduled(env, now + HOUR + 1);
    expect(await count("SELECT COUNT(*) AS n FROM auth_challenges WHERE id = 'leased-challenge'")).toBe(0);
    const run = await env.DB.prepare(
      "SELECT status, detail FROM job_runs WHERE job = 'prune.expired' ORDER BY started_at DESC LIMIT 1",
    ).first<{ status: string; detail: string }>();
    expect(run?.status).toBe("ok");
    // At least ours; other tests' challenges (5 minutes) have expired by then too.
    expect(JSON.parse(run?.detail ?? "{}").auth_challenges).toBeGreaterThanOrEqual(1);
    expect(await count("SELECT COUNT(*) AS n FROM job_states WHERE lease_until IS NOT NULL")).toBe(0);
  });
});

describe("scheduled handler", () => {
  it("runs the jobs when the cron fires", async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO auth_challenges (id, expires_at) VALUES ('cron-challenge', ?)")
      .bind(now - 1)
      .run();
    const controller = createScheduledController({ scheduledTime: new Date(now + 2 * HOUR + 1), cron: "17 * * * *" });
    const ctx = createExecutionContext();
    worker.scheduled?.(controller, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await count("SELECT COUNT(*) AS n FROM auth_challenges WHERE id = 'cron-challenge'")).toBe(0);
  });
});
