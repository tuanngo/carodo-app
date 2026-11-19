import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { DriveFields } from "../../../src/services/drives/input";
import { publishDrive } from "../../../src/services/drives/publish";
import { FIRST_POSITION } from "../../../src/services/feed/cursor";
import { type FeedPage, readerPage, sharedPage } from "../../../src/services/feed/read";
import { communityStats, MINIMUM_DRIVERS } from "../../../src/services/feed/stats";
import { feedClock } from "../../../src/services/shared/coarse-time";
import { attestDevice, BASE, claimedAccount, type TestAccount } from "../../support/app-client.ts";
import { driveInput } from "../../support/drives.ts";
import { seedDay, seedDriver } from "../../support/feed.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const QUARTER = 15 * 60 * 1000;

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
    // The newest drive ended two hours ago: released between 1 h 45 min and 2 h ago.
    expect(mine[0]?.ago).toBe("1h");
    expect(mine[0]?.drives[0]?.weather).toBe("rain");
    expect(mine[0]?.drives[1]?.weather).toBeUndefined();
    expect(mine[0]?.tripIds).toBeUndefined();
    expect(JSON.stringify(page)).not.toMatch(
      /tripId|trip_id|accountId|account_id|startedAt|endedAt|ended_at|publishedAt|revision|last_ended_at|authorId/,
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

  it("leaves out hidden, opted-out, deleted and older-than-7-days drives", async () => {
    const guest = await attestDevice(env.APP_ID);
    const recent = Date.now() - 3 * HOUR;
    const day = new Date(recent).toISOString().slice(0, 10);
    const [kept, hidden, optedOut, old] = await Promise.all([seedDriver(), seedDriver(), seedDriver(), seedDriver()]);
    await Promise.all([
      seedDay(kept.id, day, [recent]),
      seedDay(hidden.id, day, [recent]),
      seedDay(optedOut.id, day, [recent]),
      seedDay(old.id, new Date(Date.now() - 8 * DAY).toISOString().slice(0, 10), [Date.now() - 169 * HOUR]),
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

  it("pages by key without repeating an item, newest first, and refuses a crafted cursor", async () => {
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
    // All 30 end within the 7 days (the oldest 59 hours ago), newest first.
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

/**
 * The release at the quarter hour (P9), on the services with a fixed clock in 2030, far from every
 * other test's drives: others see a drive from the quarter after the one it ended in, its author at
 * once, and a publish never changes another reader's page between quarters.
 */
describe("Feed release (services, fixed clock)", () => {
  const at = (hour: number, minute: number, second = 0, ms = 0) => Date.UTC(2030, 2, 4, hour, minute, second, ms);
  const fields = (endedAt: number, localDate = "2030-03-04"): DriveFields => ({
    revision: 1,
    endedAt,
    localDate,
    localStartHour: 8,
    partOfDay: "morning",
    distanceM: 5_000,
    movingDurationS: 600,
    elapsedDurationS: 600,
    vehicle: { make: "Kia", model: "K3" },
    weather: "clear",
    shape: null,
  });
  const publishAt = async (driverId: string, endedAt: number, now: number) => {
    const caller = { accountId: driverId, sessionId: "s", keyId: "k", sharing: true };
    expect((await publishDrive(env, caller, crypto.randomUUID(), fields(endedAt), now)).ok).toBe(true);
  };
  const pageAt = async (readerId: string | null, now: number): Promise<FeedPage> => {
    const clock = feedClock(now);
    return readerPage(env, await sharedPage(env, FIRST_POSITION, clock), readerId, clock, now, true);
  };
  const of = (page: FeedPage, username: string) => page.items.filter((item) => item.displayName === username);

  it("shows a drive to others from the next quarter hour, and to its author at once", async () => {
    const driver = await seedDriver();
    await publishAt(driver.id, at(10, 30), at(10, 40)); // ended 10:37
    expect(of(await pageAt(null, at(10, 44, 59, 999)), driver.username)).toHaveLength(0);
    const released = of(await pageAt(null, at(10, 45)), driver.username);
    expect(released.map((item) => item.ago)).toEqual(["now"]);
    const own = (await pageAt(driver.id, at(10, 40))).items.filter((item) => item.isAuthor);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ ago: "now", drives: [{ ago: "now" }] });
  });

  it("never changes another reader's page between quarters when a drive is published (Review Focus 1)", async () => {
    const driver = await seedDriver();
    await publishAt(driver.id, at(9, 0), at(9, 10));
    const before = await pageAt(null, at(10, 40));
    expect(of(before, driver.username)).toHaveLength(1);
    await publishAt(driver.id, at(10, 30), at(10, 40));
    expect(await pageAt(null, at(10, 40))).toEqual(before);
    expect(of(await pageAt(null, at(10, 45)), driver.username)[0]?.drives).toHaveLength(2);
  });

  it("keeps the author's overlay out of the page others share (Review Focus 2)", async () => {
    const driver = await seedDriver();
    await publishAt(driver.id, at(11, 30), at(11, 40));
    const clock = feedClock(at(11, 40));
    const shared = await sharedPage(env, FIRST_POSITION, clock);
    const own = await readerPage(env, shared, driver.id, clock, at(11, 40), true);
    expect(own.items.filter((item) => item.isAuthor)).toHaveLength(1);
    const guest = await readerPage(env, shared, null, clock, at(11, 40), true);
    expect(of(guest, driver.username)).toHaveLength(0);
    // Later pages do not repeat the author's pinned item.
    const later = await readerPage(env, shared, driver.id, clock, at(11, 40), false);
    expect(later.items.filter((item) => item.isAuthor)).toHaveLength(0);
  });

  it("shows a drive ending at the window's first quarter, not one a quarter older", async () => {
    const now = at(12, 45);
    const start = feedClock(now).windowStart;
    const [inside, outside] = await Promise.all([seedDriver(), seedDriver()]);
    const day = new Date(start).toISOString().slice(0, 10);
    await Promise.all([seedDay(inside.id, day, [start]), seedDay(outside.id, day, [start - QUARTER])]);
    const page = await pageAt(null, now);
    expect(of(page, inside.username)).toHaveLength(1);
    expect(of(page, outside.username)).toHaveLength(0);
  });

  it("orders by the newest released drive, then by the random item id", async () => {
    const now = Date.UTC(2030, 5, 1, 12);
    const drivers = await Promise.all(Array.from({ length: 4 }, () => seedDriver()));
    const ids = await Promise.all([
      seedDay(drivers[0]?.id as string, "2030-06-01", [now - HOUR]),
      seedDay(drivers[1]?.id as string, "2030-06-01", [now - HOUR]),
      seedDay(drivers[2]?.id as string, "2030-06-01", [now - HOUR]),
      seedDay(drivers[3]?.id as string, "2030-06-01", [now - 30 * 60_000]),
    ]);
    const page = await pageAt(null, now);
    const sameQuarter = ids.slice(0, 3).sort().reverse();
    expect(page.items.map((item) => item.id)).toEqual([ids[3], ...sameQuarter]);
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
    const stale = await seedDay(driver.id, new Date(Date.now() - 9 * DAY).toISOString().slice(0, 10), [
      Date.now() - 8 * DAY,
    ]);
    // Ended this quarter: not released, so nobody else can see it to react.
    const unreleased = await seedDay(driver.id, new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10), [
      Date.now(),
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
    expect((await reaction(member, unreleased, { reaction: "fire" })).status).toBe(404);
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
    expect(await response.json()).toMatchObject({ windowHours: 168 });
    expect(response.headers.get("etag")).toBeTruthy();
  });

  // A window far from every other test's drives: the numbers are only this test's.
  it(`shows no number below ${MINIMUM_DRIVERS} drivers, only the warmup; then the window's figures`, async () => {
    const now = Date.UTC(2031, 2, 10, 12);
    const drivers = await Promise.all(Array.from({ length: MINIMUM_DRIVERS }, () => seedDriver()));
    for (const [i, driver] of drivers.slice(0, MINIMUM_DRIVERS - 1).entries()) {
      await seedDay(driver.id, "2031-03-10", [now - (i + 1) * HOUR]);
    }
    // The tenth driver's drive ended this quarter: not released, so not counted yet.
    await seedDay(drivers[MINIMUM_DRIVERS - 1]?.id as string, "2031-03-11", [now]);
    expect(await communityStats(env, feedClock(now))).toEqual({
      windowHours: 168,
      visible: false,
      drivers: null,
      distanceM: null,
      durationS: null,
      busiestHour: null,
      warmup: 0.9,
    });

    await seedDay(drivers[MINIMUM_DRIVERS - 1]?.id as string, "2031-03-10", [now - HOUR, now - 2 * HOUR]);
    // A drive a quarter older than the window counts for nothing.
    await seedDay(drivers[0]?.id as string, "2031-03-03", [feedClock(now).windowStart - QUARTER]);
    expect(await communityStats(env, feedClock(now))).toEqual({
      windowHours: 168,
      visible: true,
      drivers: MINIMUM_DRIVERS,
      distanceM: 11_000,
      durationS: 6_600,
      busiestHour: 8,
      warmup: null,
    });
  });
});
