import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { claimAccount } from "../../../src/services/accounts/claim";
import { DEFAULT_SHARING } from "../../../src/services/accounts/sharing";
import { refreshSession, startSession } from "../../../src/services/auth/sessions";
import { attestDevice, claimedAccount, type TestAccount, type TestDevice } from "../../support/app-client.ts";
import { interleaved } from "../../support/d1-interleave.ts";

/**
 * A revocation that wins stays won (ADR 0005): whatever lands between a service's round trips,
 * no request still in flight may leave a usable session behind it (APP-01, APP-04).
 */

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** `env` with its D1 binding replaced. */
function withDb(db: D1Database): Env {
  return new Proxy(env, { get: (target, key) => (key === "DB" ? db : Reflect.get(target, key)) });
}

async function liveSessionsOf(accountId: string, device: TestDevice): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT count(*) AS n FROM sessions WHERE account_id = ? AND app_key_id = ? AND revoked_at IS NULL",
  )
    .bind(accountId, device.keyId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** An account on a phone, and a session on a second device opened with its secret. */
async function twoDevices(): Promise<{ owner: TestAccount; ipad: TestDevice; ipadSession: Tokens }> {
  const owner = await claimedAccount(env.APP_ID);
  const ipad = await attestDevice(env.APP_ID);
  const opened = await ipad.send("POST", "/v1/auth/session", { accountSecret: owner.accountSecret });
  expect(opened.status).toBe(200);
  return { owner, ipad, ipadSession: await opened.json<Tokens>() };
}

describe("a refresh racing a revocation", () => {
  for (const after of [1, 2]) {
    it(`leaves no live session when the account's deletion lands after D1 call ${after}`, async () => {
      const { owner, ipad, ipadSession } = await twoDevices();
      const deletion = async () => expect((await owner.send("DELETE", "/v1/account")).status).toBe(204);

      await refreshSession(
        withDb(interleaved(env.DB, after, deletion)),
        ipadSession.refreshToken,
        ipad.keyId,
        Date.now(),
      );
      expect(await liveSessionsOf(owner.accountId, ipad)).toBe(0);
    });

    it(`leaves no live session when a reuse lands after D1 call ${after}`, async () => {
      const { owner, ipad, ipadSession } = await twoDevices();
      const reuse = () => ipad.send("POST", "/v1/auth/refresh", { refreshToken: ipadSession.refreshToken });
      // Before the rotation the second presentation is itself a refresh; after it, a reuse.
      // Either way the same token was shown twice, so the family ends.
      await refreshSession(withDb(interleaved(env.DB, after, reuse)), ipadSession.refreshToken, ipad.keyId, Date.now());
      expect(await liveSessionsOf(owner.accountId, ipad)).toBe(0);
    });
  }

  it("still rotates when nothing races it", async () => {
    const { owner, ipad, ipadSession } = await twoDevices();
    const result = await refreshSession(env, ipadSession.refreshToken, ipad.keyId, Date.now());
    expect(result.ok).toBe(true);
    expect(await liveSessionsOf(owner.accountId, ipad)).toBe(1);
  });
});

describe("a login racing the account's deletion", () => {
  it("opens no session from the secret of an account just deleted", async () => {
    const owner = await claimedAccount(env.APP_ID);
    const ipad = await attestDevice(env.APP_ID);
    const deletion = async () => expect((await owner.send("DELETE", "/v1/account")).status).toBe(204);

    const result = await startSession(
      withDb(interleaved(env.DB, 1, deletion)),
      owner.accountSecret,
      ipad.keyId,
      Date.now(),
    );
    expect(result.ok).toBe(false);
    expect(await liveSessionsOf(owner.accountId, ipad)).toBe(0);
  });
});

describe("a claim racing the deletion of the name's owner", () => {
  it("answers username_taken, and leaves no account or session behind", async () => {
    const owner = await claimedAccount(env.APP_ID);
    const newcomer = await attestDevice(env.APP_ID);
    const deletion = async () => expect((await owner.send("DELETE", "/v1/account")).status).toBe(204);
    const input = { username: owner.username, sharing: DEFAULT_SHARING, deviceCheckToken: "dc" };

    const result = await claimAccount(withDb(interleaved(env.DB, 1, deletion)), input, newcomer.keyId, Date.now());
    expect(result).toMatchObject({ ok: false, code: "conflict", reason: "username_taken" });
    const accounts = await env.DB.prepare("SELECT count(*) AS n FROM accounts WHERE username = ?")
      .bind(owner.username)
      .first<{ n: number }>();
    expect(accounts?.n).toBe(0);
    const sessions = await env.DB.prepare("SELECT count(*) AS n FROM sessions WHERE app_key_id = ?")
      .bind(newcomer.keyId)
      .first<{ n: number }>();
    expect(sessions?.n).toBe(0);
  });
});
