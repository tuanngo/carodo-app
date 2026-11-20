/** Byte helpers on Web APIs only. */

export type Bytes = Uint8Array<ArrayBuffer>;

/** base64url without padding (RFC 4648 §5), the form our own tokens and challenges travel in. */
export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** The inverse of `toBase64Url`; throws on a character outside the alphabet. */
export function fromBase64Url(text: string): Bytes {
  if (/[^A-Za-z0-9_-]/.test(text)) throw new Error("not base64url");
  return fromBase64(text.replaceAll("-", "+").replaceAll("_", "/"));
}

/** Standard base64 with padding (RFC 4648 §4), the form App Attest key ids and objects use. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Standard base64, padding optional; throws on a character outside the alphabet. */
export function fromBase64(text: string): Bytes {
  if (/[^A-Za-z0-9+/=]/.test(text)) throw new Error("not base64");
  const unpadded = text.replace(/=+$/, "");
  const binary = atob(unpadded + "=".repeat((4 - (unpadded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Lowercase hex, two digits a byte: how our hashes are stored (`secret_hash`, `name_hash`). */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** `length` bytes from the platform CSPRNG. */
export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function utf8(text: string): Bytes {
  return new TextEncoder().encode(text) as Bytes;
}

export function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export async function sha256(data: Uint8Array): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data as Bytes));
}

/**
 * Whether two byte strings are equal, in time that depends only on their length. For public
 * values (hashes we computed, ids); a secret is compared by `crypto.subtle.verify` instead.
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= (a[i] as number) ^ (b[i] as number);
  return difference === 0;
}
