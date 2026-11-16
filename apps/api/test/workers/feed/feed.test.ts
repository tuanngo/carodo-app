import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { communityStats, MINIMUM_DRIVERS } from "../../../src/services/feed/stats";
import { attestDevice, BASE, claimedAccount, type TestAccount } from "../../support/app-client.ts";
import { driveInput } from "../../support/drives.ts";
import { seedDay, seedDriver } from "../../support/feed.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Item {
  id: string;
  isAuthor: boolean;
  tripIds?: string[];
  displayName: string | null;
  vehicle: { make: string | null; model: string | null } | null;
  drives: { durationS: number; distanceM: number; ago: string; partOfDay: string; weather?: string }[];
  totalDistanceM: number;
  ago: string;
  reactions: Record<string, number>;
  myReaction: string | null;
}

interface Page {
  items: Item[];
  nextCursor: string | null;
  hasMore: boolean;
}

function read(token: string, query = "", headers: Record<string, string> = {}) {
  return exports.default.fetch(`${BASE}/v1/feed${query}`, {
    headers: { authorization: `Bearer ${token}`, ...headers },
  });
}

/** Every page from the first: other tests' drives share this database. */
async function readAll(token: string): Promise<Item[]> {
  const items: Item[] = [];
  let cursor: string | null = "";
  for (let pages = 0; cursor !== null && pages < 50; pages++) {
    const response = await read(token, `?cursor=${encodeURIComponent(cursor)}`);
    if (response.status !== 200) throw new Error(`feed: ${response.status} ${await response.text()}`);
    const page: Page = await response.json<Page>();
    items.push(...page.items);
    cursor = page.nextCursor;
    expect(page.hasMore).toBe(cursor !== null);
  }
  return items;
}

const publish = (account: TestAccount, body = driveInput()) =>
  account.send("PUT", `/v1/feed/drives/${crypto.randomUUID()}`, body);
const byName = (items: Item[], username: string) => items.filter((item) => item.displayName === username);

describe("GET /v1/feed", () => {
  it("shows a guest one item per person and local day, newest drive first, with an ETag", async () => {
    const guest = await attestDevice(env.APP_ID);
    const driver = await claimedAccount(env.APP_ID);
    const today = new Date(Date.now() - 3 * HOUR).toISOString().slice(0, 10);
    expect(
      (await publish(driver, driveInput({ endedAgoMs: 3 * HOUR, distanceM: 30_000 }, { localDate: today }))).status,
    ).toBe(204);
    expect(
      (await publish(driver, driveInput({ endedAgoMs: 2 * HOUR }, { localDate: today, weather: "rain" }))).status,
    ).toBe(204);
    const older = new Date(Date.now() - 30 * HOUR).toISOString().slice(0, 10);
    expect(
      (await publish(driver, driveInput({ endedAgoMs: 30 * HOUR, distanceM: 8_000 }, { localDate: older }))).status,
    ).toBe(204);

    const response = await read(guest.guestToken);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(response.headers.get("vary")).toBe("authorization");
    const page = await response.json<Page>();
    const mine = byName(await readAll(guest.guestToken), driver.username);
    expect(mine.map((item) => item.drives.map((drive) => drive.distanceM))).toEqual([[12_000, 30_000], [8_000]]);
    expect(mine[0]).toMatchObject({
      isAuthor: false,
      myReaction: null,
      vehicle: { make: "Kia", model: "K3" },
      totalDistanceM: 42_000,
      reactions: {},
    });
    // The newest drive started 2 h 25 min ago: its hour began 2 or 3 hours ago, never "now".
    expect(mine[0]?.ago).toMatch(/^[23]h$/);
    expect(mine[0]?.drives[0]?.weather).toBe("rain");
    expect(mine[0]?.drives[1]?.weather).toBeUndefined();
    expect(mine[0]?.tripIds).toBeUndefined();
    expect(JSON.stringify(page)).not.toMatch(
      /tripId|trip_id|accountId|account_id|startedAt|endedAt|ended_at|publishedAt|revision|sort_hour|authorId/,
    );
    expect(JSON.stringify(page)).not.toContain(driver.accountId);

    const etag = response.headers.get("etag") ?? "";
    expect((await read(guest.guestToken, "", { "if-none-match": etag })).status).toBe(304);
  });

  it("follows each author's choices at read time: anonymous, no car named", async () => {
    const guest = await attestDevice(env.APP_ID);
    const driver = await claimedAccount(env.APP_ID);
    await publish(driver);
    expect(byName(await readAll(guest.guestToken), driver.username)).toHaveLength(1);
    await driver.send("PUT", "/v1/me/sharing", { sharing: true, displayAs: "anonymous", showVehicle: false });
    expect(byName(await readAll(guest.guestToken), driver.username)).toHaveLength(0);
    const own = (await readAll(driver.accessToken)).filter((item) => item.isAuthor);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ displayName: null, vehicle: null });
  });

  it("marks a member's own item with its trips, and only theirs", async () => {
    const [member, other] = await Promise.all([claimedAccount(env.APP_ID), claimedAccount(env.APP_ID)]);
    const tripId = crypto.randomUUID();
    expect((await member.send("PUT", `/v1/feed/drives/${tripId}`, driveInput())).status).toBe(204);
    await publish(other);

    const response = await read(member.accessToken);
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    const items = await readAll(member.accessToken);
    const own = items.filter((item) => item.isAuthor);
    expect(own).toHaveLength(1);
    expect(own[0]?.tripIds).toEqual([tripId]);
    const theirs = byName(items, other.username);
    expect(theirs[0]).toMatchObject({ isAuthor: false });
    expect(theirs[0]?.tripIds).toBeUndefined();
  });

  it("leaves out hidden, unpublished, stopped, opted-out, deleted and older-than-72-hours drives", async () => {
    const guest = await attestDevice(env.APP_ID);
    const recent = Date.now() - 3 * HOUR;
    const day = new Date(recent).toISOString().slice(0, 10);
    const [kept, hidden, optedOut, old] = await Promise.all([seedDriver(), seedDriver(), seedDriver(), seedDriver()]);
    await Promise.all([
      seedDay(kept.id, day, [recent]),
      seedDay(hidden.id, day, [recent]),
      seedDay(optedOut.id, day, [recent]),
      seedDay(old.id, new Date(Date.now() - 4 * DAY).toISOString().slice(0, 10), [Date.now() - 73 * HOUR]),
    ]);
    await env.DB.batch([
      // A drive moderation hid whose item was not refreshed: the page still leaves it out.
      env.DB.prepare("UPDATE drives SET hidden_at = 1 WHERE account_id = ?").bind(hidden.id),
      env.DB.prepare("UPDATE accounts SET feed_opt_in = 0 WHERE id = ?").bind(optedOut.id),
    ]);
    const deleted = await claimedAccount(env.APP_ID);
    await publish(deleted);
    expect((await deleted.send("DELETE", "/v1/account")).status).toBe(204);

    const items = await readAll(guest.guestToken);
    expect(byName(items, kept.username)).toHaveLength(1);
    for (const gone of [hidden.username, optedOut.username, old.username, deleted.username]) {
      expect(byName(items, gone), gone).toHaveLength(0);
    }
  });

  it("pages by key without repeating an item, newest hour first, and refuses a crafted cursor", async () => {
    const guest = await attestDevice(env.APP_ID);
    const base = Math.floor(Date.now() / HOUR) * HOUR - HOUR;
    // 30 drivers two hours apart within the window, one of them with 3 drives that day (one item).
    const drivers = await Promise.all(Array.from({ length: 30 }, () => seedDriver()));
    await Promise.all(
      drivers.map((driver, i) => {
        const at = base - i * 2 * HOUR + 60_000;
        const ends = i === 7 ? [at - 40 * 60_000, at - 20 * 60_000, at] : [at];
        return seedDay(driver.id, new Date(at).toISOString().slice(0, 10), ends);
      }),
    );
    const items = await readAll(guest.guestToken);
    const names = drivers.map((driver) => driver.username);
    const seen = items.filter((item) => names.includes(item.displayName ?? ""));
    // All 30 end within the 72 hours (the oldest 59 hours ago), newest first.
    expect(seen.map((item) => item.displayName)).toEqual(names);
    expect(seen[7]?.drives).toHaveLength(3);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);

    expect((await read(guest.guestToken, "?cursor=bm90LWEtY3Vyc29y")).status).toBe(400);
  });

  it("answers requests racing for one page alike", async () => {
    const guest = await attestDevice(env.APP_ID);
    const pages = await Promise.all([read(guest.guestToken), read(guest.guestToken), read(guest.guestToken)]);
    expect(pages.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(new Set(pages.map((response) => response.headers.get("etag"))).size).toBe(1);
  });

  it("refuses a reader without a valid token", async () => {
    expect((await exports.default.fetch(`${BASE}/v1/feed`)).status).toBe(401);
    expect((await read("not.a-token")).status).toBe(401);
  });
});

describe("PUT/DELETE /v1/feed/items/{itemId}/reaction", () => {
  const reaction = (account: TestAccount, itemId: string, body?: unknown) =>
    account.send(body === undefined ? "DELETE" : "PUT", `/v1/feed/items/${itemId}/reaction`, body);

  it("counts one reaction per reader, replaced by their next, shown only as counts", async () => {
    const [author, fan, other] = await Promise.all([
      claimedAccount(env.APP_ID),
      claimedAccount(env.APP_ID),
      claimedAccount(env.APP_ID),
    ]);
    await publish(author);
    const itemId = byName(await readAll(fan.accessToken), author.username)[0]?.id as string;

    expect((await reaction(fan, itemId, { reaction: "fire" })).status).toBe(204);
    expect((await reaction(fan, itemId, { reaction: "road" })).status).toBe(204);
    expect((await reaction(other, itemId, { reaction: "road" })).status).toBe(204);
    const seenByFan = byName(await readAll(fan.accessToken), author.username)[0];
    expect(seenByFan).toMatchObject({ reactions: { road: 2 }, myReaction: "road" });
    const seenByAuthor = (await readAll(author.accessToken)).find((item) => item.isAuthor);
    expect(seenByAuthor).toMatchObject({ reactions: { road: 2 }, myReaction: null });
    expect(JSON.stringify(seenByAuthor)).not.toContain(fan.accountId);

    expect((await reaction(fan, itemId)).status).toBe(204);
    expect((await reaction(fan, itemId)).status).toBe(204);
    expect(byName(await readAll(fan.accessToken), author.username)[0]).toMatchObject({
      reactions: { road: 1 },
      myReaction: null,
    });
  });

  it("is for members, with one of the five reactions, on an item still on the Feed", async () => {
    const member = await claimedAccount(env.APP_ID);
    const driver = await seedDriver();
    const fresh = await seedDay(driver.id, new Date().toISOString().slice(0, 10), [Date.now() - HOUR]);
    const stale = await seedDay(driver.id, new Date(Date.now() - 5 * DAY).toISOString().slice(0, 10), [
      Date.now() - 4 * DAY,
    ]);

    const guest = await member.device.send(
      "PUT",
      `/v1/feed/items/${fresh}/reaction`,
      { reaction: "fire" },
      {
        authorization: `Bearer ${member.device.guestToken}`,
      },
    );
    expect(guest.status).toBe(401);
    expect((await reaction(member, fresh, { reaction: "like" })).status).toBe(400);
    expect((await reaction(member, "not-an-id", { reaction: "fire" })).status).toBe(400);
    expect((await reaction(member, crypto.randomUUID(), { reaction: "fire" })).status).toBe(404);
    expect((await reaction(member, stale, { reaction: "fire" })).status).toBe(404);
    expect((await reaction(member, fresh, { reaction: "coffee" })).status).toBe(204);
  });
});

describe("GET /v1/feed/stats", () => {
  it("answers every reader the same, cached publicly, with an ETag", async () => {
    const guest = await attestDevice(env.APP_ID);
    const response = await exports.default.fetch(`${BASE}/v1/feed/stats`, {
      headers: { authorization: `Bearer ${guest.guestToken}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await response.json()).toMatchObject({ windowHours: 72 });
    expect(response.headers.get("etag")).toBeTruthy();
  });

  // A window far from every other test's drives: the numbers are only this test's.
  it(`shows no number below ${MINIMUM_DRIVERS} drivers, only the warmup; then the window's figures`, async () => {
    const now = Date.UTC(2031, 2, 10, 12);
    const drivers = await Promise.all(Array.from({ length: MINIMUM_DRIVERS }, () => seedDriver()));
    for (const [i, driver] of drivers.slice(0, MINIMUM_DRIVERS - 1).entries()) {
      await seedDay(driver.id, "2031-03-10", [now - (i + 1) * HOUR]);
    }
    expect(await communityStats(env, now)).toEqual({
      windowHours: 72,
      visible: false,
      drivers: null,
      distanceM: null,
      durationS: null,
      busiestHour: null,
      warmup: 0.9,
    });

    await seedDay(drivers[MINIMUM_DRIVERS - 1]?.id as string, "2031-03-10", [now - HOUR, now - 2 * HOUR]);
    // A drive outside the window counts for nothing.
    await seedDay(drivers[0]?.id as string, "2031-03-06", [now - 73 * HOUR]);
    expect(await communityStats(env, now)).toEqual({
      windowHours: 72,
      visible: true,
      drivers: MINIMUM_DRIVERS,
      distanceM: 11_000,
      durationS: 6_600,
      busiestHour: 8,
      warmup: null,
    });
  });
});
