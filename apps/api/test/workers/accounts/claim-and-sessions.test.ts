import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { LABEL_ACCESS_TOKEN } from "../../../src/lib/crypto/secret-key";
import { isUuid } from "../../../src/lib/platform/ids";
import { verifyToken } from "../../../src/services/auth/tokens";
import { attestDevice, type TestDevice } from "../../support/app-client.ts";

interface Claimed {
  accountSecret: string;
  session: { accessToken: string; refreshToken: string; expiresIn: number };
  profile: { id: string; username: string };
}

let usernameCount = 0;
const uniqueName = () => `driver_${Date.now() % 100000}_${usernameCount++}`;

function claim(device: TestDevice, body: Record<string, unknown>, guestToken = device.guestToken) {
  return device.send(
    "POST",
    "/v1/accounts",
    { deviceCheckToken: "dc-token", ...body },
    { authorization: `Bearer ${guestToken}` },
  );
}

async function claimed(device: TestDevice, username = uniqueName()): Promise<Claimed> {
  const response = await claim(device, { username });
  if (response.status !== 201) throw new Error(`claim: ${response.status} ${await response.text()}`);
  return response.json<Claimed>();
}

describe("POST /v1/accounts", () => {
  it("creates the account with its secret and this device's first session, sharing off", async () => {
    const device = await attestDevice(env.APP_ID);
    const response = await claim(device, { username: "Night.Driver_1" });
    expect(response.status).toBe(201);
    const body = await response.json<Claimed>();

    expect(body.profile).toEqual({ id: body.profile.id, username: "night.driver_1" });
    expect(isUuid(body.profile.id)).toBe(true);
    expect(body.accountSecret.startsWith(`${body.profile.id}.`)).toBe(true);
    expect(body.session.expiresIn).toBe(900);

    const access = await verifyToken(env.SECRET_KEY, LABEL_ACCESS_TOKEN, body.session.accessToken, Date.now());
    expect(access.ok && access.data.subject.startsWith(`${body.profile.id}/`)).toBe(true);

    // Only hashes at rest; the session is bound to the attested key; sharing off by default.
    const account = await env.DB.prepare(
      "SELECT secret_hash, feed_opt_in, display_as, show_vehicle FROM accounts WHERE id = ?",
    )
      .bind(body.profile.id)
      .first<{ secret_hash: string }>();
    expect(JSON.stringify(account)).not.toContain(body.accountSecret);
    expect(account).toMatchObject({ feed_opt_in: 0, display_as: "anonymous", show_vehicle: 1 });
    const session = await env.DB.prepare("SELECT app_key_id FROM sessions WHERE account_id = ?")
      .bind(body.profile.id)
      .first();
    expect(session).toEqual({ app_key_id: device.keyId });
  });

  it("starts sharing when the claim says so", async () => {
    const response = await claim(await attestDevice(env.APP_ID), {
      username: uniqueName(),
      sharing: { sharing: true, displayAs: "username", showVehicle: false },
    });
    expect(response.status).toBe(201);
    const { profile } = await response.json<Claimed>();
    const account = await env.DB.prepare("SELECT feed_opt_in, display_as, show_vehicle FROM accounts WHERE id = ?")
      .bind(profile.id)
      .first();
    expect(account).toEqual({ feed_opt_in: 1, display_as: "username", show_vehicle: 0 });
  });

  it("answers 409 username_taken whatever the case", async () => {
    const name = uniqueName();
    await claimed(await attestDevice(env.APP_ID), name);
    const response = await claim(await attestDevice(env.APP_ID), { username: name.toUpperCase() });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "username_taken" });
  });

  // One claim each: claims share the per-address limit; the other names are checked through
  // GET /v1/usernames, which asks the same rule (profile-and-sharing.test.ts).
  it("answers 409 username_reserved for a reserved policy", async () => {
    for (const username of ["csgt"]) {
      const response = await claim(await attestDevice(env.APP_ID), { username });
      expect(response.status, username).toBe(409);
      expect(await response.json()).toMatchObject({ code: "username_reserved" });
    }
  });

  it("answers 409 username_profane from the seeded policies", async () => {
    const response = await claim(await attestDevice(env.APP_ID), { username: "di.tme_99" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "username_profane" });
  });

  it("needs a guest token of the same key", async () => {
    const device = await attestDevice(env.APP_ID);
    const other = await attestDevice(env.APP_ID);
    const noToken = await device.send("POST", "/v1/accounts", { username: uniqueName(), deviceCheckToken: "x" });
    expect(noToken.status).toBe(401);
    const otherKeysToken = await claim(device, { username: uniqueName() }, other.guestToken);
    expect(otherKeysToken.status).toBe(401);
  });

  it("needs a valid assertion", async () => {
    const device = await attestDevice(env.APP_ID);
    const response = await claim(device, { username: uniqueName() }, device.guestToken);
    expect(response.status).toBe(201);
    // The assertion signs the body: the same header with another body fails.
    const { exports } = await import("cloudflare:workers");
    const unsigned = await exports.default.fetch("https://api.carodo.test/v1/accounts", {
      method: "POST",
      headers: { authorization: `Bearer ${device.guestToken}`, "content-type": "application/json" },
      body: JSON.stringify({ username: uniqueName() }),
    });
    expect(unsigned.status).toBe(401);
  });

  it("names the field it refuses", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ username: "ab" }, "username_invalid"],
      [{ username: "has space" }, "username_invalid"],
      [{ username: "_leading" }, "username_invalid"],
      [{ username: uniqueName(), sharing: { sharing: "yes" } }, "validation"],
      [{ username: uniqueName(), sharing: { sharing: true, displayAs: "name", showVehicle: true } }, "validation"],
      [{ username: uniqueName(), deviceCheckToken: "" }, "validation"],
    ];
    for (const [body, code] of cases) {
      // A device per case: claims are limited to 5 a minute per key, before validation.
      const response = await claim(await attestDevice(env.APP_ID), body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json()).toMatchObject({ code });
    }
  });
});

it("limits claims per key", async () => {
  const device = await attestDevice(env.APP_ID);
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await claim(device, { username: "x" })).status);
  expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
});

describe("POST /v1/auth/session", () => {
  it("opens a session on another device from the account secret", async () => {
    const account = await claimed(await attestDevice(env.APP_ID));
    const newPhone = await attestDevice(env.APP_ID);
    const response = await newPhone.send("POST", "/v1/auth/session", { accountSecret: account.accountSecret });
    expect(response.status).toBe(200);
    const tokens = await response.json<Claimed["session"]>();
    expect(tokens.refreshToken).not.toBe(account.session.refreshToken);

    const sessions = await env.DB.prepare("SELECT app_key_id FROM sessions WHERE account_id = ? ORDER BY created_at")
      .bind(account.profile.id)
      .all();
    expect(sessions.results.map((row) => row.app_key_id)).toContain(newPhone.keyId);
  });

  it("refuses a wrong secret and a malformed one alike", async () => {
    const account = await claimed(await attestDevice(env.APP_ID));
    const device = await attestDevice(env.APP_ID);
    const wrong = `${account.profile.id}.${"A".repeat(43)}`;
    for (const accountSecret of [wrong, "garbage"]) {
      const response = await device.send("POST", "/v1/auth/session", { accountSecret });
      expect(response.status).toBe(401);
    }
  });

  it("needs an assertion", async () => {
    const { exports } = await import("cloudflare:workers");
    const response = await exports.default.fetch("https://api.carodo.test/v1/auth/session", {
      method: "POST",
      body: JSON.stringify({ accountSecret: "x" }),
    });
    expect(response.status).toBe(401);
  });
});

describe("POST /v1/auth/refresh", () => {
  it("rotates the refresh token", async () => {
    const device = await attestDevice(env.APP_ID);
    const account = await claimed(device);
    const first = await device.send("POST", "/v1/auth/refresh", { refreshToken: account.session.refreshToken });
    expect(first.status).toBe(200);
    const rotated = await first.json<Claimed["session"]>();
    expect(rotated.refreshToken).not.toBe(account.session.refreshToken);

    const second = await device.send("POST", "/v1/auth/refresh", { refreshToken: rotated.refreshToken });
    expect(second.status).toBe(200);
  });

  it("revokes the whole family when a rotated token is used again", async () => {
    const device = await attestDevice(env.APP_ID);
    const account = await claimed(device);
    const rotated = await (
      await device.send("POST", "/v1/auth/refresh", { refreshToken: account.session.refreshToken })
    ).json<Claimed["session"]>();

    const reused = await device.send("POST", "/v1/auth/refresh", { refreshToken: account.session.refreshToken });
    expect(reused.status).toBe(401);
    // The thief's reuse also ends the legitimate current token.
    const current = await device.send("POST", "/v1/auth/refresh", { refreshToken: rotated.refreshToken });
    expect(current.status).toBe(401);
  });

  it("refuses a token shown by another device's key, and revokes it", async () => {
    const device = await attestDevice(env.APP_ID);
    const account = await claimed(device);
    const thief = await attestDevice(env.APP_ID);
    const stolen = await thief.send("POST", "/v1/auth/refresh", { refreshToken: account.session.refreshToken });
    expect(stolen.status).toBe(401);
    const owner = await device.send("POST", "/v1/auth/refresh", { refreshToken: account.session.refreshToken });
    expect(owner.status).toBe(401);
  });

  it("refuses an unknown token", async () => {
    const device = await attestDevice(env.APP_ID);
    const response = await device.send("POST", "/v1/auth/refresh", { refreshToken: "A".repeat(43) });
    expect(response.status).toBe(401);
  });
});
