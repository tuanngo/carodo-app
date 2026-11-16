import { LABEL_GUEST_TOKEN } from "../../lib/crypto/secret-key";
import type { Bytes } from "../../lib/encoding/bytes";
import { writeEvent } from "../../lib/observability/analytics";
import { assertWithKey, saveAttestedKey } from "../attest/app-keys";
import { parseAssertionHeader } from "../attest/assertion";
import { type AttestationInput, verifyAttestation } from "../attest/attestation";
import { attestPolicy } from "../attest/policy";
import { base64Field, isRecord, stringField } from "../shared/input";
import { fail, ok, type Result } from "../shared/result";
import { consumeChallenge } from "./challenges";
import { mintToken } from "./tokens";

/**
 * Guest tokens (carodo-ios ADR 0009): about an hour, read-only (the Feed, its community numbers,
 * username checks). The subject is the attested key id, for rate limiting only, never an account.
 */

export const GUEST_TOKEN_TTL_S = 3600;

export interface GuestToken {
  guestToken: string;
  expiresIn: number;
}

/** The first-time body: `{ keyId, challenge, attestation }` (contract: `/v1/auth/guest`). */
export function parseGuestAttestation(body: unknown): Result<AttestationInput> {
  if (!isRecord(body)) return fail("validation", "The body must be a JSON object.");
  const keyId = base64Field(body, "keyId", { maxBytes: 32, exactBytes: 32 });
  if (!keyId.ok) return keyId;
  const challenge = stringField(body, "challenge", 64);
  if (!challenge.ok) return challenge;
  const attestation = base64Field(body, "attestation", { maxBytes: 16 * 1024 });
  if (!attestation.ok) return attestation;
  return ok({ keyId: keyId.data, challenge: challenge.data, attestation: attestation.data });
}

/** First time for a key: spend the challenge, verify the attestation, keep the key, issue a token. */
export async function guestFromAttestation(
  env: Env,
  input: AttestationInput,
  now: number,
): Promise<Result<GuestToken>> {
  // Spent before verifying: a failed attempt cannot retry with the same challenge.
  const challenge = await consumeChallenge(env.DB, input.challenge, now);
  if (!challenge.ok) return challenge;

  const attested = await verifyAttestation(attestPolicy(env), input, now);
  if (!attested.ok) return attested;
  const saved = await saveAttestedKey(env.DB, attested.data, now);
  if (!saved.ok) return saved;
  writeEvent(env.EVENTS, "key.attested", attested.data.environment);

  return ok(await issueGuestToken(env, attested.data.keyId, now));
}

/** Later: an assertion by a stored key over this request (empty body). */
export async function guestFromAssertion(
  env: Env,
  header: string,
  clientData: Bytes,
  now: number,
): Promise<Result<GuestToken>> {
  const parsed = parseAssertionHeader(header);
  if (!parsed.ok) return parsed;
  const asserted = await assertWithKey(
    env.DB,
    attestPolicy(env),
    parsed.data.keyId,
    parsed.data.assertion,
    clientData,
    now,
  );
  if (!asserted.ok) return asserted;
  return ok(await issueGuestToken(env, asserted.data.keyId, now));
}

async function issueGuestToken(env: Env, keyId: string, now: number): Promise<GuestToken> {
  const expiresAt = now + GUEST_TOKEN_TTL_S * 1000;
  return {
    guestToken: await mintToken(env.SECRET_KEY, LABEL_GUEST_TOKEN, keyId, expiresAt),
    expiresIn: GUEST_TOKEN_TTL_S,
  };
}
