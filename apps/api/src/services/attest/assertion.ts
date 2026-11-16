import { type Bytes, bytesEqual, concat, fromBase64, sha256, toBase64, utf8 } from "../../lib/encoding/bytes";
import { type CborValue, decodeCbor, mapGet } from "../../lib/encoding/cbor";
import { logEvent } from "../../lib/observability/log";
import { fail, ok, type Result } from "../shared/result";
import { parseAuthenticatorData, Refusal, verifyP256 } from "./attestation";

/**
 * Per-request proof from an attested key (carodo-ios ADR 0009, docs/sync.md "App Attest"): the
 * `Carodo-App-Assertion` header signs the request's method, path and body hash with a counter that
 * must rise, so a captured request cannot be replayed or altered.
 */

export interface StoredKey {
  publicKey: Bytes;
  counter: number;
}

/** `METHOD \n path-and-query \n base64(SHA-256(body))`: the bytes an assertion signs. */
export async function clientDataOf(method: string, pathAndQuery: string, body: Uint8Array): Promise<Bytes> {
  return utf8(`${method.toUpperCase()}\n${pathAndQuery}\n${toBase64(await sha256(body))}`);
}

/** The header's two byte sequences (an RFC 8941 dictionary: `key=:…:, assertion=:…:`). */
export function parseAssertionHeader(value: string): Result<{ keyId: Bytes; assertion: Bytes }> {
  const refused = fail("unauthorized", "The app assertion header is not valid.");
  if (value.length > 8192) return refused;
  const members = new Map<string, Bytes>();
  for (const member of value.split(",")) {
    const match = /^([a-z][a-z0-9_.*-]*)=:([A-Za-z0-9+/]*={0,2}):$/.exec(member.trim());
    if (!match || members.has(match[1] as string)) return refused;
    try {
      members.set(match[1] as string, fromBase64(match[2] as string));
    } catch {
      return refused;
    }
  }
  const keyId = members.get("key");
  const assertion = members.get("assertion");
  if (keyId?.length !== 32 || !assertion) return refused;
  return ok({ keyId, assertion });
}

export async function verifyAssertion(
  appId: string,
  key: StoredKey,
  assertion: Bytes,
  clientData: Bytes,
): Promise<Result<{ counter: number }>> {
  try {
    let object: CborValue;
    try {
      object = decodeCbor(assertion);
    } catch {
      throw new Refusal("cbor");
    }
    const signature = mapGet(object, "signature");
    const authenticatorData = mapGet(object, "authenticatorData");
    if (!(signature instanceof Uint8Array) || !(authenticatorData instanceof Uint8Array)) throw new Refusal("fields");

    const data = parseAuthenticatorData(authenticatorData, false);
    if (!bytesEqual(data.rpIdHash, await sha256(utf8(appId)))) throw new Refusal("app id");
    if (data.counter <= key.counter) throw new Refusal("counter");
    const nonce = await sha256(concat(authenticatorData, await sha256(clientData)));
    if (!(await verifyP256(key.publicKey, signature, nonce))) throw new Refusal("signature");
    return ok({ counter: data.counter });
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    logEvent("warn", "attest.assertion_refused", { reason: error.message });
    return fail("unauthorized", "The app assertion is not valid.");
  }
}
