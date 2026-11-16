import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { parseDriveInput } from "../../../src/services/drives/input";
import { MAX_DRIVES_PER_DAY, publishDrive } from "../../../src/services/drives/publish";
import { FIRST_POSITION } from "../../../src/services/feed/cursor";
import { WINDOW_MS } from "../../../src/services/feed/items";
import { COUNTS_SQL, DRIVES_SQL, ITEMS, ITEMS_SQL, MINE_SQL } from "../../../src/services/feed/read";
import { BUSIEST_SQL, TOTALS_SQL } from "../../../src/services/feed/stats";
import { publicHour } from "../../../src/services/shared/coarse-time";
import { driveInput } from "../../support/drives.ts";

/**
 * Rows read by the Feed's queries at a realistic size (cost C1, C14): a page must cost about a
 * page, however large the tables grow. The statements are the services' own, measured through
 * `meta.rows_read`; full scans are caught by setup.ts for every test. Printed so the report can
 * state them.
 */

const HOUR = 60 * 60 * 1000;
const ACCOUNTS = 500;
const DRIVES = 10_000;
const NOW = Date.UTC(2032, 5, 1, 12);
const reader = "0190f0a0-0000-7000-8000-000000000000";
const account = (i: number) => `0190f0a0-0000-7000-8000-${String(i).padStart(12, "0")}`;

/** Drives spread over a year before NOW, a drive every ~53 minutes across everyone; one item per account and day. */
beforeAll(async () => {
  const accounts = Array.from({ length: ACCOUNTS }, (_, i) => account(i));
  const drives = Array.from({ length: DRIVES }, (_, i) => {
    const endedAt = NOW - ((i * 104_729) % (24 * 365)) * HOUR - 60_000;
    const owner = accounts[(i * 7919) % ACCOUNTS] as string;
    const day = new Date(endedAt).toISOString().slice(0, 10);
    return { trip: crypto.randomUUID(), owner, endedAt, day, item: `${owner}|${day}` };
  });
  const items = new Map<string, { id: string; owner: string; day: string; last: number }>();
  for (const drive of drives) {
    const known = items.get(drive.item);
    if (!known)
      items.set(drive.item, { id: crypto.randomUUID(), owner: drive.owner, day: drive.day, last: drive.endedAt });
    else known.last = Math.max(known.last, drive.endedAt);
  }
  const itemRows = [...items.values()].map((item) => [item.id, item.owner, item.day, item.last]);
  const driveRows = drives.map((drive) => [
    drive.trip,
    drive.owner,
    items.get(drive.item)?.id,
    drive.endedAt,
    drive.day,
  ]);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO accounts (id, username, secret_hash, feed_opt_in, display_as, created_at, updated_at)
       SELECT value, 'c' || substr(value, -12), 'x', 1, 'username', 0, 0 FROM json_each(?)`,
    ).bind(JSON.stringify(accounts)),
    env.DB.prepare(
      `INSERT INTO feed_items (id, account_id, local_date, sort_hour, last_ended_at, created_at)
       SELECT value ->> 0, value ->> 1, value ->> 2, (value ->> 3) - (value ->> 3) % ${HOUR}, value ->> 3, 0
       FROM json_each(?)`,
    ).bind(JSON.stringify(itemRows)),
    env.DB.prepare(
      `INSERT INTO drives (trip_id, account_id, item_id, distance_m, moving_duration_s, elapsed_duration_s, started_at,
         ended_at, drove_at, local_date, local_start_hour, part_of_day, weather, revision, published_at, updated_at)
       SELECT value ->> 0, value ->> 1, value ->> 2, 1000, 60, 60, value ->> 3, value ->> 3, value ->> 3,
         value ->> 4, 8, 'morning', 'clear', 1, 0, 0 FROM json_each(?)`,
    ).bind(JSON.stringify(driveRows)),
    env.DB.prepare(
      `INSERT INTO reactions (item_id, account_id, reaction, created_at)
       SELECT value, ?, 'fire', 0 FROM json_each(?)`,
    ).bind(reader, JSON.stringify(itemRows.slice(0, 2_000).map((row) => row[0]))),
  ]);
});

async function rowsRead(sql: string, ...params: unknown[]): Promise<{ read: number; results: unknown[] }> {
  const { meta, results } = await env.DB.prepare(sql)
    .bind(...params)
    .all();
  return { read: meta.rows_read, results };
}

describe(`Feed reads at size (${ACCOUNTS} accounts, ${DRIVES} drives over a year)`, () => {
  const since = publicHour(NOW - WINDOW_MS);

  it("reads about a page of items, and their drives and reactions", async () => {
    const items = await rowsRead(ITEMS_SQL, since, FIRST_POSITION.sortHour, FIRST_POSITION.itemId);
    console.log(`feed items: ${items.read} rows read for ${items.results.length} rows`);
    // An item and its account: two rows per item on the page, and the index's.
    expect(items.read).toBeLessThanOrEqual(3 * (ITEMS + 1) + 2);

    const ids = JSON.stringify((items.results as { id: string }[]).slice(0, ITEMS).map((row) => row.id));
    const drives = await rowsRead(DRIVES_SQL, ids, NOW - WINDOW_MS);
    const counts = await rowsRead(COUNTS_SQL, ids);
    const mine = await rowsRead(MINE_SQL, reader, ids);
    console.log(`feed drives: ${drives.read}, counts: ${counts.read}, mine: ${mine.read} rows read`);
    // At most a day's cap of drives per item, read through the item index (and a json_each row each).
    expect(drives.read).toBeLessThanOrEqual(ITEMS * (2 * MAX_DRIVES_PER_DAY + 1));
    expect(drives.read).toBeLessThan(DRIVES / 10);
    expect(counts.read).toBeLessThanOrEqual(ITEMS * 4);
    expect(mine.read).toBeLessThanOrEqual(ITEMS * 3);
  });

  it("reads only the window's drives for the community numbers", async () => {
    const window = (
      await rowsRead("SELECT count(*) AS n FROM drives WHERE ended_at >= ? -- full scan: test", NOW - WINDOW_MS)
    ).results[0] as { n: number };
    const totals = await rowsRead(TOTALS_SQL, NOW - WINDOW_MS, NOW + 300_000);
    const busiest = await rowsRead(BUSIEST_SQL, NOW - WINDOW_MS, NOW + 300_000);
    console.log(`stats: ${totals.read} + ${busiest.read} rows read for ${window.n} drives in the window`);
    expect(totals.read).toBeLessThanOrEqual(2 * window.n + 2);
    expect(busiest.read).toBeLessThanOrEqual(2 * window.n + 2);
  });

  it("writes a few rows to publish a drive, and reads about the day's", async () => {
    const totals = { read: 0, written: 0 };
    const db = new Proxy(env.DB, {
      get(target, key) {
        if (key !== "batch") return Reflect.get(target, key).bind?.(target) ?? Reflect.get(target, key);
        return async (statements: D1PreparedStatement[]) => {
          const results = await target.batch(statements);
          for (const result of results) {
            totals.read += result.meta.rows_read;
            totals.written += result.meta.rows_written;
          }
          return results;
        };
      },
    });
    const withDb = new Proxy(env, { get: (target, key) => (key === "DB" ? db : Reflect.get(target, key)) });
    const now = Date.now();
    const drive = parseDriveInput(driveInput(), now);
    if (!drive.ok) throw new Error("drive");
    // A driver of its own: the seeded drives sit in 2032, ahead of the real clock this publishes on.
    const driver = account(ACCOUNTS + 1);
    await env.DB.prepare(
      "INSERT INTO accounts (id, username, secret_hash, feed_opt_in, created_at, updated_at) VALUES (?, 'pub_cost', 'x', 1, 0, 0)",
    )
      .bind(driver)
      .run();
    const caller = { accountId: driver, sessionId: "s", keyId: "k", sharing: true };
    expect((await publishDrive(withDb, caller, crypto.randomUUID(), drive.data, now)).ok).toBe(true);
    console.log(`publish (new day): ${totals.read} rows read, ${totals.written} rows written`);
    const first = { ...totals };
    const tripId = crypto.randomUUID();
    expect((await publishDrive(withDb, caller, tripId, drive.data, now)).ok).toBe(true);
    console.log(
      `publish (same day): ${totals.read - first.read} rows read, ${totals.written - first.written} rows written`,
    );
    // A drive row and its 4 index rows, the item row and its 2 index rows, the item's refresh.
    expect(totals.written - first.written).toBeLessThanOrEqual(12);
    expect(totals.read - first.read).toBeLessThanOrEqual(40);

    // A retry of the same revision (the outbox resends after a lost answer) writes nothing (C3).
    const second = { ...totals };
    expect((await publishDrive(withDb, caller, tripId, drive.data, now)).ok).toBe(true);
    console.log(`publish (retry): ${totals.read - second.read} rows read, ${totals.written - second.written} written`);
    expect(totals.written - second.written).toBe(0);
  });
});
