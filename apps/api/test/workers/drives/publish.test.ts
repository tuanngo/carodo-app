import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { MAX_DRIVES_PER_DAY } from "../../../src/services/drives/publish";
import { pruneExpired } from "../../../src/services/jobs/prune";
import { claimedAccount, type TestAccount } from "../../support/app-client.ts";
import { driveInput } from "../../support/drives.ts";

const HOUR = 60 * 60 * 1000;

interface DriveRow {
  account_id: string;
  item_id: string;
  revision: number;
  distance_m: number;
  drove_at: number;
  started_at: number;
  ended_at: number;
  local_date: string;
  local_start_hour: number;
  weather: string;
  shape: string | null;
  published_at: number;
  updated_at: number;
  unpublished_at: number | null;
  stopped_at: number | null;
  vehicle_model: string | null;
}

async function row(tripId: string): Promise<DriveRow | null> {
  return env.DB.prepare("SELECT * FROM drives WHERE trip_id = ?").bind(tripId).first<DriveRow>();
}

async function item(id: string) {
  return env.DB.prepare("SELECT * FROM feed_items WHERE id = ?")
    .bind(id)
    .first<{ account_id: string; local_date: string; sort_hour: number | null; last_ended_at: number | null }>();
}

const put = (account: TestAccount, tripId: string, body: unknown) =>
  account.send("PUT", `/v1/feed/drives/${tripId}`, body);
const unpublish = (account: TestAccount, tripId: string, revision: number) =>
  account.send("DELETE", `/v1/feed/drives/${tripId}?revision=${revision}`);
const sharing = (account: TestAccount, on: boolean) =>
  account.send("PUT", "/v1/me/sharing", { sharing: on, displayAs: "username", showVehicle: true });

describe("PUT /v1/feed/drives/{tripId}", () => {
  it("publishes the summary into its day's item, with the start's hour and the end's hour for the order", async () => {
    const account = await claimedAccount(env.APP_ID);
    const tripId = crypto.randomUUID();
    const body = driveInput({ endedAgoMs: 2 * HOUR }, { weather: "rain" });
    expect((await put(account, tripId.toUpperCase(), body)).status).toBe(204);

    const stored = await row(tripId);
    expect(stored).toMatchObject({
      account_id: account.accountId,
      revision: 1,
      distance_m: 12_000,
      started_at: Date.parse(body.startedAt as string),
      ended_at: Date.parse(body.endedAt as string),
      local_date: body.localDate,
      local_start_hour: body.localStartHour,
      weather: "rain",
      stopped_at: null,
    });
    expect(JSON.parse(stored?.shape ?? "null")).toEqual(body.shape);
    expect((stored?.drove_at ?? 1) % HOUR).toBe(0);
    expect(stored?.published_at).toBe(stored?.updated_at);

    const day = await item(stored?.item_id ?? "");
    const endedAt = stored?.ended_at ?? 0;
    expect(day).toMatchObject({
      account_id: account.accountId,
      local_date: body.localDate,
      last_ended_at: endedAt,
      sort_hour: endedAt - (endedAt % HOUR),
    });
  });

  it("keeps one item per person and local day, with a random id that a joining drive keeps", async () => {
    const account = await claimedAccount(env.APP_ID);
    const [first, second, other] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    // Both days come from one moment, the newest drive's start: a day read off "now − 26 h" can sit
    // two UTC days from a drive that ended an hour ago, which the server rejects (before 02:00 UTC).
    const anchor = Date.now() - HOUR - 25 * 60 * 1000;
    const day = new Date(anchor).toISOString().slice(0, 10);
    const previousDay = new Date(anchor - 24 * HOUR).toISOString().slice(0, 10);
    await put(account, first, driveInput({ endedAgoMs: 2 * HOUR }, { localDate: day }));
    const itemId = (await row(first))?.item_id as string;
    expect(itemId).not.toContain(account.accountId);
    await put(account, second, driveInput({ endedAgoMs: HOUR }, { localDate: day }));
    expect((await row(second))?.item_id).toBe(itemId);
    // The item moves up to its newest drive.
    expect((await item(itemId))?.last_ended_at).toBe((await row(second))?.ended_at);

    await put(account, other, driveInput({ endedAgoMs: 26 * HOUR - 30 * 60 * 1000 }, { localDate: previousDay }));
    expect((await row(other))?.item_id).not.toBe(itemId);

    // A new revision moving a drive to another day takes it out of its old item.
    await put(account, second, driveInput({ endedAgoMs: HOUR, revision: 2 }, { localDate: previousDay }));
    expect((await row(second))?.item_id).toBe((await row(other))?.item_id);
    expect((await item(itemId))?.last_ended_at).toBe((await row(first))?.ended_at);
  });

  it("applies a higher revision, ignores a lower or equal one, and keeps the first publish time", async () => {
    const account = await claimedAccount(env.APP_ID);
    const tripId = crypto.randomUUID();
    await put(account, tripId, driveInput({ revision: 2 }));
    const first = await row(tripId);

    // A late, older update: success, nothing changes.
    expect((await put(account, tripId, driveInput({ revision: 1 }, { vehicle: { model: "Old" } }))).status).toBe(204);
    expect((await row(tripId))?.vehicle_model).toBe("K3");
    // A retry of the same revision: the same.
    expect((await put(account, tripId, driveInput({ revision: 2 }, { vehicle: { model: "Retry" } }))).status).toBe(204);
    expect((await row(tripId))?.vehicle_model).toBe("K3");
    // A newer one applies.
    expect((await put(account, tripId, driveInput({ revision: 3 }, { vehicle: { model: "Morning" } }))).status).toBe(
      204,
    );
    expect(await row(tripId)).toMatchObject({
      revision: 3,
      vehicle_model: "Morning",
      published_at: first?.published_at,
    });
  });

  it("refuses a drive while sharing is off, a future start, a place, and another account's trip", async () => {
    const quiet = await claimedAccount(env.APP_ID, { sharing: false });
    const refused = await put(quiet, crypto.randomUUID(), driveInput());
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "sharing_off" });

    const account = await claimedAccount(env.APP_ID);
    const future = await put(
      account,
      crypto.randomUUID(),
      driveInput({}, { startedAt: new Date(Date.now() + HOUR).toISOString() }),
    );
    expect(future.status).toBe(422);
    expect(await future.json()).toMatchObject({ code: "start_time_invalid" });

    const placed = await put(account, crypto.randomUUID(), driveInput({}, { startPlace: { latitude: 10.7 } }));
    expect(placed.status).toBe(422);
    expect(await placed.json()).toMatchObject({ code: "geo_payload_rejected" });

    const short = await put(account, crypto.randomUUID(), driveInput({ distanceM: 50 }));
    expect(short.status).toBe(422);
    expect(await short.json()).toMatchObject({ code: "out_of_range" });

    const tripId = crypto.randomUUID();
    await put(account, tripId, driveInput());
    const intruder = await claimedAccount(env.APP_ID);
    expect((await put(intruder, tripId, driveInput({ revision: 9 }))).status).toBe(404);
    expect((await row(tripId))?.account_id).toBe(account.accountId);
  });

  it(`refuses drive ${MAX_DRIVES_PER_DAY + 1} of one day, but not a republish, nor one on another day`, async () => {
    const account = await claimedAccount(env.APP_ID);
    const body = driveInput();
    const kept = crypto.randomUUID();
    expect((await put(account, kept, body)).status).toBe(204);
    // The day's other drives straight in D1 (the write limit allows 60 requests a minute).
    const itemId = (await row(kept))?.item_id;
    await env.DB.prepare(
      `INSERT INTO drives (trip_id, account_id, item_id, distance_m, moving_duration_s, elapsed_duration_s,
         started_at, ended_at, drove_at, local_date, revision, published_at, updated_at)
       SELECT value, ?, ?, 1000, 60, 60, 0, 0, 0, ?, 1, 0, 0 FROM json_each(?)`,
    )
      .bind(
        account.accountId,
        itemId,
        body.localDate,
        JSON.stringify(Array.from({ length: MAX_DRIVES_PER_DAY - 1 }, () => crypto.randomUUID())),
      )
      .run();

    const extra = crypto.randomUUID();
    const refused = await put(account, extra, body);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ code: "out_of_range" });
    expect(await row(extra)).toBeNull();

    expect((await put(account, kept, driveInput({ revision: 2 }))).status).toBe(204);
    expect((await unpublish(account, kept, 2)).status).toBe(204);
    expect((await put(account, extra, body)).status).toBe(204);

    const yesterday = new Date(Date.now() - 26 * HOUR).toISOString().slice(0, 10);
    const other = driveInput({ endedAgoMs: 26 * HOUR - 30 * 60 * 1000 }, { localDate: yesterday });
    expect((await put(account, crypto.randomUUID(), other)).status).toBe(204);
  });

  it("needs an access token and an assertion", async () => {
    const account = await claimedAccount(env.APP_ID);
    const tripId = crypto.randomUUID();
    const guest = await account.device.send("PUT", `/v1/feed/drives/${tripId}`, driveInput(), {
      authorization: `Bearer ${account.device.guestToken}`,
    });
    expect(guest.status).toBe(401);
    const unsigned = await exports.default.fetch(`https://api.carodo.test/v1/feed/drives/${tripId}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${account.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(driveInput()),
    });
    expect(unsigned.status).toBe(401);
    // The pre-0.27 path is gone.
    expect((await account.send("PUT", `/v1/drives/${tripId}`, driveInput())).status).toBe(404);
  });
});

describe("Stop sharing (PUT /v1/me/sharing)", () => {
  it("takes every drive off the Feed; a republish at the same revision brings it back once on", async () => {
    const account = await claimedAccount(env.APP_ID);
    const [kept, hid] = [crypto.randomUUID(), crypto.randomUUID()];
    await put(account, kept, driveInput({ revision: 4 }));
    await put(account, hid, driveInput({ revision: 2 }));
    expect((await unpublish(account, hid, 2)).status).toBe(204);
    const itemId = (await row(kept))?.item_id as string;

    expect((await sharing(account, false)).status).toBe(200);
    expect((await row(kept))?.stopped_at).not.toBeNull();
    expect((await item(itemId))?.sort_hour).toBeNull();
    // While off, nothing is published.
    expect((await put(account, kept, driveInput({ revision: 4 }))).status).toBe(403);

    expect((await sharing(account, true)).status).toBe(200);
    // On again, the drives stay off until the app republishes them.
    expect((await item(itemId))?.sort_hour).toBeNull();
    expect((await put(account, kept, driveInput({ revision: 4 }))).status).toBe(204);
    expect(await row(kept)).toMatchObject({ revision: 4, stopped_at: null });
    expect((await item(itemId))?.sort_hour).not.toBeNull();
    // A drive the person hid keeps its tombstone: the same revision does not show it.
    expect((await put(account, hid, driveInput({ revision: 2 }))).status).toBe(204);
    expect((await row(hid))?.unpublished_at).not.toBeNull();
  });
});

describe("DELETE /v1/feed/drives/{tripId} (late arrivals, ADR 0007)", () => {
  it("hides at the drive's own revision; a late equal or older publish cannot bring it back; a newer one can", async () => {
    const account = await claimedAccount(env.APP_ID);
    const tripId = crypto.randomUUID();
    await put(account, tripId, driveInput({ revision: 2 }));
    const itemId = (await row(tripId))?.item_id as string;
    expect((await unpublish(account, tripId, 2)).status).toBe(204);
    expect((await row(tripId))?.unpublished_at).not.toBeNull();
    expect((await item(itemId))?.sort_hour).toBeNull();

    for (const revision of [1, 2]) expect((await put(account, tripId, driveInput({ revision }))).status).toBe(204);
    expect((await row(tripId))?.unpublished_at).not.toBeNull();

    expect((await put(account, tripId, driveInput({ revision: 3 }))).status).toBe(204);
    expect(await row(tripId)).toMatchObject({ revision: 3, unpublished_at: null });
    expect((await item(itemId))?.sort_hour).not.toBeNull();
  });

  it("leaves a tombstone when the unpublish overtakes its publish", async () => {
    const account = await claimedAccount(env.APP_ID);
    const tripId = crypto.randomUUID();
    expect((await unpublish(account, tripId, 5)).status).toBe(204);
    expect((await put(account, tripId, driveInput({ revision: 4 }))).status).toBe(204);
    expect(await row(tripId)).toMatchObject({ revision: 5, distance_m: 0, item_id: null });
    expect((await row(tripId))?.unpublished_at).not.toBeNull();
  });

  it("is silent about another account's trip and changes nothing", async () => {
    const account = await claimedAccount(env.APP_ID);
    const tripId = crypto.randomUUID();
    await put(account, tripId, driveInput());
    const intruder = await claimedAccount(env.APP_ID);
    expect((await unpublish(intruder, tripId, 99)).status).toBe(204);
    expect(await row(tripId)).toMatchObject({ account_id: account.accountId, unpublished_at: null, revision: 1 });
  });

  it("needs a revision", async () => {
    const account = await claimedAccount(env.APP_ID);
    expect((await account.send("DELETE", `/v1/feed/drives/${crypto.randomUUID()}`)).status).toBe(400);
  });

  it("keeps a tombstone 30 days, then prunes it", async () => {
    const account = await claimedAccount(env.APP_ID);
    const tripId = crypto.randomUUID();
    await unpublish(account, tripId, 1);
    const day = 24 * HOUR;
    await pruneExpired(env.DB, Date.now() + 29 * day);
    expect(await row(tripId)).not.toBeNull();
    await pruneExpired(env.DB, Date.now() + 31 * day);
    expect(await row(tripId)).toBeNull();
  });
});
