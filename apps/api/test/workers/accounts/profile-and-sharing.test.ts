import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { RENAMES_PER_WINDOW } from "../../../src/services/accounts/profile";
import { isUsernameHeld, USERNAME_HOLD_MS } from "../../../src/services/accounts/usernames";
import { attestDevice, BASE, claimedAccount } from "../../support/app-client.ts";

let count = 0;
const uniqueName = () => `me_${Date.now() % 100000}_${count++}`;

function get(path: string, token: string) {
  return exports.default.fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
}

describe("GET /v1/usernames/{username}", () => {
  it("answers available, or why not, for guests and members alike", async () => {
    const guest = await attestDevice(env.APP_ID);
    const owner = await claimedAccount(env.APP_ID);
    const cases: [string, boolean, string | null][] = [
      [uniqueName(), true, null],
      [owner.username.toUpperCase(), false, "taken"],
      ["support", false, "reserved"],
      ["testflight", false, "reserved"],
      ["bad.fuck.name", false, "profane"],
      ["vcl", false, "profane"],
      [`vclass_${count++}`, true, null],
      ["carodo.official", false, "reserved"],
      ["no", false, "invalid"],
      ["trailing_", false, "invalid"],
    ];
    for (const [name, available, reason] of cases) {
      const response = await get(`/v1/usernames/${encodeURIComponent(name)}`, guest.guestToken);
      expect(response.status, name).toBe(200);
      expect(await response.json(), name).toMatchObject({ available, reason });
    }
    expect((await get(`/v1/usernames/${uniqueName()}`, owner.accessToken)).status).toBe(200);
  });

  it("suggests free names for a taken one", async () => {
    const guest = await attestDevice(env.APP_ID);
    const owner = await claimedAccount(env.APP_ID);
    const body = await (await get(`/v1/usernames/${owner.username}`, guest.guestToken)).json<{
      suggestions: string[];
    }>();
    expect(body.suggestions.length).toBeGreaterThan(0);
    for (const name of body.suggestions) {
      expect(name.startsWith(owner.username.slice(0, 16))).toBe(true);
      expect(await (await get(`/v1/usernames/${name}`, guest.guestToken)).json()).toMatchObject({ available: true });
    }
  });

  it("needs a token", async () => {
    expect((await exports.default.fetch(`${BASE}/v1/usernames/${uniqueName()}`)).status).toBe(401);
  });
});

describe("/v1/me/profile", () => {
  it("reads the username and renames, holding the old name 90 days", async () => {
    const account = await claimedAccount(env.APP_ID);
    expect(await (await get("/v1/me/profile", account.accessToken)).json()).toEqual({
      id: account.accountId,
      username: account.username,
    });

    const next = uniqueName();
    const renamed = await account.send("PUT", "/v1/me/profile", { username: next.toUpperCase() });
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toEqual({ id: account.accountId, username: next });
    expect(await isUsernameHeld(env, account.username, Date.now())).toBe(true);
    expect(await isUsernameHeld(env, account.username, Date.now() + USERNAME_HOLD_MS + 60_000)).toBe(false);

    // Nobody takes the old name, the owner included, without learning why.
    const other = await claimedAccount(env.APP_ID);
    const taken = await other.send("PUT", "/v1/me/profile", { username: account.username });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ code: "username_taken" });
  });

  it("changes nothing for the same name, and refuses taken, reserved, profane or invalid names", async () => {
    const [account, other] = await Promise.all([claimedAccount(env.APP_ID), claimedAccount(env.APP_ID)]);
    expect((await account.send("PUT", "/v1/me/profile", { username: account.username })).status).toBe(200);
    for (const [username, status, code] of [
      [other.username, 409, "username_taken"],
      ["admin", 409, "username_reserved"],
      ["ditmay123", 409, "username_profane"],
      ["a b", 400, "username_invalid"],
    ] as const) {
      const response = await account.send("PUT", "/v1/me/profile", { username });
      expect(response.status, username).toBe(status);
      expect(await response.json()).toMatchObject({ code });
    }
    const none = await env.DB.prepare("SELECT count(*) AS n FROM username_changes WHERE account_id = ?")
      .bind(account.accountId)
      .first<{ n: number }>();
    expect(none?.n).toBe(0);
  });

  it(`allows ${RENAMES_PER_WINDOW} changes in 30 days, then answers 429 username_change_limit`, async () => {
    const account = await claimedAccount(env.APP_ID);
    for (let i = 0; i < RENAMES_PER_WINDOW; i++) {
      expect((await account.send("PUT", "/v1/me/profile", { username: uniqueName() })).status).toBe(200);
    }
    const name = uniqueName();
    const refused = await account.send("PUT", "/v1/me/profile", { username: name });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: "username_change_limit" });
    // The refused name stays free.
    expect(await isUsernameHeld(env, name, Date.now())).toBe(false);
  });

  it("needs an account", async () => {
    const guest = await attestDevice(env.APP_ID);
    expect((await get("/v1/me/profile", guest.guestToken)).status).toBe(401);
  });
});

describe("/v1/me/sharing", () => {
  it("reads and stores the three choices", async () => {
    const account = await claimedAccount(env.APP_ID, { sharing: false, displayAs: "anonymous" });
    expect(await (await get("/v1/me/sharing", account.accessToken)).json()).toEqual({
      sharing: false,
      displayAs: "anonymous",
      showVehicle: true,
    });
    const choices = { sharing: true, displayAs: "username", showVehicle: false };
    const stored = await account.send("PUT", "/v1/me/sharing", choices);
    expect(stored.status).toBe(200);
    expect(await stored.json()).toEqual(choices);
    expect(await (await get("/v1/me/sharing", account.accessToken)).json()).toEqual(choices);
  });

  it("refuses a malformed body", async () => {
    const account = await claimedAccount(env.APP_ID);
    for (const body of [{}, { sharing: true, displayAs: "everyone", showVehicle: true }, { sharing: 1 }]) {
      expect((await account.send("PUT", "/v1/me/sharing", body)).status, JSON.stringify(body)).toBe(400);
    }
  });
});
