import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { isUsernameHeld, USERNAME_HOLD_MS } from "../../../src/services/accounts/usernames";
import { attestDevice, type TestDevice } from "../../support/app-client.ts";
import { driveInput } from "../../support/drives.ts";

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
interface Claimed {
  accountSecret: string;
  session: Session;
  profile: { id: string; username: string };
}

let count = 0;
const uniqueName = () => `life_${Date.now() % 100000}_${count++}`;

async function claimed(device: TestDevice, username = uniqueName()): Promise<Claimed> {
  const response = await device.send(
    "POST",
    "/v1/accounts",
    { username, deviceCheckToken: "dc", sharing: { sharing: true, displayAs: "username", showVehicle: true } },
    { authorization: `Bearer ${device.guestToken}` },
  );
  if (response.status !== 201) throw new Error(`claim: ${response.status} ${await response.text()}`);
  return response.json<Claimed>();
}

async function sessionOn(device: TestDevice, accountSecret: string): Promise<Response> {
  return device.send("POST", "/v1/auth/session", { accountSecret });
}

const bearer = (session: Session) => ({ authorization: `Bearer ${session.accessToken}` });

const SHARING = { sharing: true, displayAs: "anonymous", showVehicle: true };

describe("access tokens", () => {
  it("keeps an access token valid across its session's refresh", async () => {
    const phone = await attestDevice(env.APP_ID);
    const account = await claimed(phone);
    const refreshed = await phone.send("POST", "/v1/auth/refresh", { refreshToken: account.session.refreshToken });
    expect(refreshed.status).toBe(200);
    // A request already in flight with the earlier access token still passes.
    expect((await phone.send("PUT", "/v1/me/sharing", SHARING, bearer(account.session))).status).toBe(200);
  });

  it("refuses an access token presented with another device's assertion", async () => {
    const phone = await attestDevice(env.APP_ID);
    const account = await claimed(phone);
    const thief = await attestDevice(env.APP_ID);
    expect((await thief.send("PUT", "/v1/me/sharing", SHARING, bearer(account.session))).status).toBe(401);
  });

  it("needs an access token, not a guest token", async () => {
    const phone = await attestDevice(env.APP_ID);
    const response = await phone.send("PUT", "/v1/me/sharing", SHARING, {
      authorization: `Bearer ${phone.guestToken}`,
    });
    expect(response.status).toBe(401);
  });

  it("is gone with the route that sign out everywhere had (contract 0.28.0)", async () => {
    const phone = await attestDevice(env.APP_ID);
    const account = await claimed(phone);
    expect((await phone.send("POST", "/v1/account/secret", undefined, bearer(account.session))).status).toBe(404);
  });
});

describe("DELETE /v1/account", () => {
  it("makes the account unusable at once and holds the username", async () => {
    const phone = await attestDevice(env.APP_ID);
    const name = uniqueName();
    const account = await claimed(phone, name);
    const tripId = crypto.randomUUID();
    const published = await phone.send("PUT", `/v1/feed/drives/${tripId}`, driveInput(), bearer(account.session));
    expect(published.status).toBe(204);

    const deleted = await phone.send("DELETE", "/v1/account", undefined, bearer(account.session));
    expect(deleted.status).toBe(204);

    // Every way back is closed.
    expect((await phone.send("DELETE", "/v1/account", undefined, bearer(account.session))).status).toBe(401);
    expect((await phone.send("POST", "/v1/auth/refresh", { refreshToken: account.session.refreshToken })).status).toBe(
      401,
    );
    expect((await sessionOn(await attestDevice(env.APP_ID), account.accountSecret)).status).toBe(401);

    // The row no longer carries the name; the drive left the Feed; erasure is owed.
    const row = await env.DB.prepare("SELECT username, display_name, deleted_at FROM accounts WHERE id = ?")
      .bind(account.profile.id)
      .first<{ username: string; deleted_at: number }>();
    expect(row?.username).toBe(`deleted:${account.profile.id}`);
    expect(row?.deleted_at).toBeGreaterThan(0);
    const visible = await env.DB.prepare("SELECT COUNT(*) AS n FROM drives WHERE account_id = ? AND hidden_at IS NULL")
      .bind(account.profile.id)
      .first<{ n: number }>();
    expect(visible?.n).toBe(0);
    const onFeed = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM feed_items WHERE account_id = ? AND sort_hour IS NOT NULL",
    )
      .bind(account.profile.id)
      .first<{ n: number }>();
    expect(onFeed?.n).toBe(0);
    const owed = await env.DB.prepare("SELECT kind FROM pending_ops WHERE target = ?").bind(account.profile.id).first();
    expect(owed).toEqual({ kind: "account.erase" });

    // Nobody can take the name now, without learning it was deleted; after 90 days it is free.
    const taker = await attestDevice(env.APP_ID);
    const taken = await taker.send(
      "POST",
      "/v1/accounts",
      { username: name.toUpperCase(), deviceCheckToken: "dc" },
      { authorization: `Bearer ${taker.guestToken}` },
    );
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ code: "username_taken" });
    expect(await isUsernameHeld(env, name, Date.now())).toBe(true);
    expect(await isUsernameHeld(env, name, Date.now() + USERNAME_HOLD_MS + 60_000)).toBe(false);

    // The hold is linked to nothing: no table holds the name in clear.
    const holds = await env.DB.prepare("SELECT name_hash FROM username_holds").all<{ name_hash: string }>();
    expect(holds.results.some((hold) => hold.name_hash.includes(name))).toBe(false);
  });

  it("needs an assertion", async () => {
    const phone = await attestDevice(env.APP_ID);
    const account = await claimed(phone);
    const { exports } = await import("cloudflare:workers");
    const response = await exports.default.fetch("https://api.carodo.test/v1/account", {
      method: "DELETE",
      headers: bearer(account.session),
    });
    expect(response.status).toBe(401);
  });
});
