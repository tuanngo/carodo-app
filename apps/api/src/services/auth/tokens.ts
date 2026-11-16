import { deriveHmacKey } from "../../lib/crypto/secret-key";
import { fromBase64Url, toBase64Url, utf8 } from "../../lib/encoding/bytes";
import { fail, ok, type Result } from "../shared/result";

/**
 * Stateless signed tokens (`payload.signature`, both base64url), checked without a D1 read: the
 * payload is `subject:expiresAt`, signed with HMAC-SHA-256 under a key derived for one kind of
 * token (`lib/crypto/secret-key`), so a guest token never passes as another kind.
 */

export interface TokenClaims {
  subject: string;
  expiresAt: number;
}

export async function mintToken(root: string, label: string, subject: string, expiresAt: number): Promise<string> {
  const payload = utf8(`${subject}:${expiresAt}`);
  const signature = await crypto.subtle.sign("HMAC", await deriveHmacKey(root, label), payload);
  return `${toBase64Url(payload)}.${toBase64Url(new Uint8Array(signature))}`;
}

/** The token's claims when its signature holds for `label` and it has not expired. */
export async function verifyToken(
  root: string,
  label: string,
  token: string,
  now: number,
): Promise<Result<TokenClaims>> {
  const refused = fail("unauthorized", "The token is not valid.");
  const parts = token.split(".");
  if (parts.length !== 2 || token.length > 512) return refused;

  let payload: Uint8Array<ArrayBuffer>;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    payload = fromBase64Url(parts[0] as string);
    signature = fromBase64Url(parts[1] as string);
  } catch {
    return refused;
  }
  // verify() compares in constant time.
  if (!(await crypto.subtle.verify("HMAC", await deriveHmacKey(root, label), signature, payload))) return refused;

  const text = new TextDecoder().decode(payload);
  const separator = text.lastIndexOf(":");
  const expiresAt = Number(text.slice(separator + 1));
  if (separator <= 0 || !Number.isSafeInteger(expiresAt) || expiresAt <= now) return refused;
  return ok({ subject: text.slice(0, separator), expiresAt });
}
