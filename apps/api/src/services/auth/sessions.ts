import { LABEL_ACCESS_TOKEN } from "../../lib/crypto/secret-key";
import { bytesEqual, randomBytes, sha256, toBase64Url, utf8 } from "../../lib/encoding/bytes";
import { logEvent } from "../../lib/observability/log";
import { uuidv7 } from "../../lib/platform/ids";
import { DAY_MS } from "../../lib/time/units";
import { isRecord, stringField } from "../shared/input";
import { fail, ok, type Result } from "../shared/result";
import { mintToken, verifyToken } from "./tokens";

/**
 * Sessions (docs/sync.md "Accounts"): one per device, bound to the attested key that opened it.
 * The access token is stateless (~15 min); the refresh token rotates on every use. Each refresh
 * token is one `sessions` row: a refresh revokes its row and adds the next one to the same family,
 * so a revoked token presented again is a reuse, and the whole family is revoked. The family is
 * the device's session: an access token names it, and holds only while the family has a live row
 * and the account is not deleted, so sign-out and deletion take effect at once.
 */

export const ACCESS_TOKEN_TTL_S = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 90 * DAY_MS;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Lowercase hex SHA-256: how secrets and refresh tokens are kept (`secret_hash`, `refresh_hash`). */
export async function hashSecret(value: string): Promise<string> {
  return Array.from(await sha256(utf8(value)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A random 256-bit token, base64url. */
export function newSecretToken(): string {
  return toBase64Url(randomBytes(32));
}

export interface PreparedSession {
  /** Runs alone or inside a batch with the statement that creates the account. */
  statement: D1PreparedStatement;
  issue(): Promise<Tokens>;
}

/**
 * What must still hold when the row is written, checked by the same statement: a check made one
 * round trip earlier is stale by then, and a revocation that landed in between must win.
 */
export interface SessionGuard {
  sql: string;
  values: unknown[];
}

/** In a batch: the statement just before changed exactly one row (it revoked the predecessor, it created the account). */
export const AFTER_ONE_CHANGE: SessionGuard = { sql: "changes() = 1", values: [] };

/**
 * A new session row for `accountId` on `keyId`, in `familyId` (a new family when omitted), written
 * only while `guard` holds; the caller reads `meta.changes` to learn whether it was.
 */
export async function prepareSession(
  env: Env,
  accountId: string,
  keyId: string,
  now: number,
  options: { familyId?: string; guard?: SessionGuard } = {},
): Promise<PreparedSession> {
  const familyId = options.familyId ?? uuidv7(now);
  const sessionId = uuidv7(now);
  const refreshToken = newSecretToken();
  const guard = options.guard;
  const statement = env.DB.prepare(
    `INSERT INTO sessions (id, account_id, app_key_id, family_id, refresh_hash, expires_at, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?${guard ? ` WHERE ${guard.sql}` : ""}`,
  ).bind(
    sessionId,
    accountId,
    keyId,
    familyId,
    await hashSecret(refreshToken),
    now + REFRESH_TOKEN_TTL_MS,
    now,
    ...(guard?.values ?? []),
  );
  return {
    statement,
    issue: async () => ({
      accessToken: await mintToken(
        env.SECRET_KEY,
        LABEL_ACCESS_TOKEN,
        `${accountId}/${familyId}`,
        now + ACCESS_TOKEN_TTL_S * 1000,
      ),
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_S,
    }),
  };
}

/** `{ accountSecret }` or `{ refreshToken }`: the one field each of these bodies holds. */
export function parseTokenBody(body: unknown, field: "accountSecret" | "refreshToken"): Result<string> {
  if (!isRecord(body)) return fail("validation", "The body must be a JSON object.");
  return stringField(body, field, 128);
}

/** The account id an account secret names (`<account id>.<random>`), or null. */
export function accountIdOfSecret(secret: string): string | null {
  const match = /^([0-9a-f-]{36})\.[A-Za-z0-9_-]{43}$/.exec(secret);
  return match ? (match[1] as string) : null;
}

/** A device that holds the account secret (reinstall, new iPhone) opens its own session. */
export async function startSession(
  env: Env,
  accountSecret: string,
  keyId: string,
  now: number,
): Promise<Result<Tokens>> {
  const refused = fail("unauthorized", "The account secret is not valid.");
  const accountId = accountIdOfSecret(accountSecret);
  if (!accountId) return refused;
  const account = await env.DB.prepare("SELECT secret_hash FROM accounts WHERE id = ? AND deleted_at IS NULL")
    .bind(accountId)
    .first<{ secret_hash: string }>();
  // Hash first either way, so a missing account and a wrong secret take the same time.
  const presented = utf8(await hashSecret(accountSecret));
  if (!account || !bytesEqual(presented, utf8(account.secret_hash))) return refused;

  // Written only if the secret is still the one just checked: sign out everywhere may have
  // replaced it since, and a session from the old secret must not outlive that.
  const session = await prepareSession(env, accountId, keyId, now, {
    guard: {
      sql: "EXISTS (SELECT 1 FROM accounts WHERE id = ? AND secret_hash = ? AND deleted_at IS NULL)",
      values: [accountId, account.secret_hash],
    },
  });
  const { meta } = await session.statement.run();
  if (meta.changes !== 1) return refused;
  return ok(await session.issue());
}

interface SessionRow {
  id: string;
  account_id: string;
  app_key_id: string;
  family_id: string;
  expires_at: number;
  revoked_at: number | null;
  deleted_at: number | null;
}

/** Rotates a refresh token presented by the key its session is bound to. */
export async function refreshSession(
  env: Env,
  refreshToken: string,
  keyId: string,
  now: number,
): Promise<Result<Tokens>> {
  const refused = fail("unauthorized", "The refresh token is not valid.");
  const row = await env.DB.prepare(
    `SELECT s.id, s.account_id, s.app_key_id, s.family_id, s.expires_at, s.revoked_at, a.deleted_at
     FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.refresh_hash = ?`,
  )
    .bind(await hashSecret(refreshToken))
    .first<SessionRow>();
  if (!row) return refused;

  // Used again after it rotated, or shown by another device's key: someone else holds it.
  if (row.revoked_at !== null || row.app_key_id !== keyId) {
    await revokeFamily(env.DB, row.family_id, now, row.revoked_at !== null ? "reuse" : "other_key");
    return refused;
  }
  if (row.expires_at <= now || row.deleted_at !== null) return refused;

  // One transaction: only the request that revokes the row gets its successor, so a revocation
  // that landed since the read (a reuse, sign out everywhere) wins, and a concurrent second
  // refresh is a reuse. Never two round trips: one between them could revive a revoked family.
  const next = await prepareSession(env, row.account_id, keyId, now, {
    familyId: row.family_id,
    guard: AFTER_ONE_CHANGE,
  });
  const [rotated] = await env.DB.batch([
    env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(now, row.id),
    next.statement,
  ]);
  if (rotated?.meta.changes !== 1) {
    await revokeFamily(env.DB, row.family_id, now, "reuse");
    return refused;
  }
  return ok(await next.issue());
}

async function revokeFamily(db: D1Database, familyId: string, now: number, reason: string): Promise<void> {
  await db
    .prepare("UPDATE sessions SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL")
    .bind(now, familyId)
    .run();
  logEvent("warn", "auth.session_family_revoked", { reason });
}

export interface AccountCaller {
  accountId: string;
  /** The device's session (its family id). */
  sessionId: string;
  /** The attested key the session is bound to. */
  keyId: string;
  /** Sharing on (`accounts.feed_opt_in`), read with the session so publishing costs no second query. */
  sharing: boolean;
}

/**
 * An access token's caller, when the token is genuine, unexpired, its session still live and its
 * account not deleted: one indexed read of the live row, so a revoked session stops at once.
 */
export async function authenticateAccess(env: Env, token: string, now: number): Promise<Result<AccountCaller>> {
  const refused = fail("unauthorized", "The access token is not valid.");
  const claims = await verifyToken(env.SECRET_KEY, LABEL_ACCESS_TOKEN, token, now);
  if (!claims.ok) return refused;
  const [accountId, familyId, ...rest] = claims.data.subject.split("/");
  if (!accountId || !familyId || rest.length > 0) return refused;

  const live = await env.DB.prepare(
    `SELECT s.app_key_id, a.feed_opt_in FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.family_id = ? AND s.revoked_at IS NULL AND s.account_id = ? AND a.deleted_at IS NULL`,
  )
    .bind(familyId, accountId)
    .first<{ app_key_id: string; feed_opt_in: number }>();
  if (!live) return refused;
  return ok({
    accountId,
    sessionId: familyId,
    keyId: live.app_key_id,
    sharing: live.feed_opt_in === 1,
  });
}
