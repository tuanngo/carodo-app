import { type Bytes, toBase64 } from "../../lib/encoding/bytes";
import { fail, ok, type Result } from "../shared/result";
import { verifyAssertion } from "./assertion";
import type { AttestedKey } from "./attestation";
import type { AttestPolicy } from "./policy";

/**
 * Attested keys in D1 (`app_keys`). A key id serves rate limiting and token binding only: never
 * linked to analytics or an installation id (carodo-ios ADR 0006, 0009).
 */

/** Stores a newly attested key; a key id seen before is refused (Apple: one attestation per key). */
export async function saveAttestedKey(db: D1Database, key: AttestedKey, now: number): Promise<Result<null>> {
  const { meta } = await db
    .prepare(
      `INSERT INTO app_keys (id, public_key, counter, environment, attested_at, last_used_at)
       VALUES (?, ?, 0, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    )
    .bind(key.keyId, key.publicKey, key.environment, now, now)
    .run();
  if (meta.changes !== 1) return fail("unauthorized", "This key is already attested.");
  return ok(null);
}

/**
 * Verifies an assertion by a stored key and records its counter. The update holds only while the
 * stored counter is still lower, so two requests racing with one assertion cannot both pass.
 */
export async function assertWithKey(
  db: D1Database,
  policy: Pick<AttestPolicy, "appId">,
  keyIdBytes: Bytes,
  assertion: Bytes,
  clientData: Bytes,
  now: number,
): Promise<Result<{ keyId: string }>> {
  const keyId = toBase64(keyIdBytes);
  const row = await db
    .prepare("SELECT public_key, counter FROM app_keys WHERE id = ?")
    .bind(keyId)
    .first<{ public_key: ArrayBuffer | number[]; counter: number }>();
  if (!row) return fail("unauthorized", "The app assertion is not valid.");

  const publicKey = new Uint8Array(row.public_key);
  const verified = await verifyAssertion(policy.appId, { publicKey, counter: row.counter }, assertion, clientData);
  if (!verified.ok) return verified;

  const { meta } = await db
    .prepare("UPDATE app_keys SET counter = ?, last_used_at = ? WHERE id = ? AND counter < ?")
    .bind(verified.data.counter, now, keyId, verified.data.counter)
    .run();
  if (meta.changes !== 1) return fail("unauthorized", "The app assertion is not valid.");
  return ok({ keyId });
}
