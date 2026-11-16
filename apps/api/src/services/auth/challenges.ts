import { randomBytes, toBase64Url } from "../../lib/encoding/bytes";
import { MINUTE_MS } from "../../lib/time/units";
import { fail, ok, type Result } from "../shared/result";

/**
 * App Attest challenges (carodo-ios ADR 0009, docs/sync.md "App Attest"): random, single use,
 * valid for 5 minutes. The app hashes one into the attestation of a new key; the server consumes
 * it once while verifying that attestation, so a captured attestation cannot be replayed.
 */

export const CHALLENGE_TTL_MS = 5 * MINUTE_MS;

/** 32 bytes: unguessable, and the same size as the SHA-256 the app derives from it. */
const CHALLENGE_BYTES = 32;

export interface IssuedChallenge {
  challenge: string;
  expiresAt: number;
}

export async function issueChallenge(db: D1Database, now: number): Promise<Result<IssuedChallenge>> {
  const challenge = toBase64Url(randomBytes(CHALLENGE_BYTES));
  const expiresAt = now + CHALLENGE_TTL_MS;
  await db.prepare("INSERT INTO auth_challenges (id, expires_at) VALUES (?, ?)").bind(challenge, expiresAt).run();
  return ok({ challenge, expiresAt });
}

/**
 * Spends a challenge: one statement deletes it and reports whether it was live, so two requests
 * racing with the same challenge cannot both succeed. An expired one is spent too, and refused.
 */
export async function consumeChallenge(db: D1Database, challenge: string, now: number): Promise<Result<null>> {
  const row = await db
    .prepare("DELETE FROM auth_challenges WHERE id = ? RETURNING expires_at")
    .bind(challenge)
    .first<{ expires_at: number }>();
  if (!row || row.expires_at <= now) return fail("unauthorized", "The challenge is unknown, used or expired.");
  return ok(null);
}
