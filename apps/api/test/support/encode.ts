/**
 * Encoders the server never needs (it only reads CBOR and DER), for building App Attest objects in
 * tests and in scripts/app-attest-vectors.ts. No imports, so Node runs this file as it is.
 */

export type Cbor = number | Uint8Array | string | Cbor[] | Map<string | number, Cbor> | boolean | null;

export function cbor(value: Cbor): Uint8Array {
  if (value === false) return Uint8Array.of(0xf4);
  if (value === true) return Uint8Array.of(0xf5);
  if (value === null) return Uint8Array.of(0xf6);
  if (typeof value === "number") return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (value instanceof Uint8Array) return join(head(2, value.length), value);
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    return join(head(3, bytes.length), bytes);
  }
  if (Array.isArray(value)) return join(head(4, value.length), ...value.map(cbor));
  const parts = [head(5, value.size)];
  for (const [key, item] of value) parts.push(cbor(key), cbor(item));
  return join(...parts);
}

function head(major: number, argument: number): Uint8Array {
  if (argument < 24) return Uint8Array.of((major << 5) | argument);
  if (argument < 0x100) return Uint8Array.of((major << 5) | 24, argument);
  if (argument < 0x10000) return Uint8Array.of((major << 5) | 25, argument >> 8, argument & 0xff);
  return Uint8Array.of(
    (major << 5) | 26,
    argument >>> 24,
    (argument >> 16) & 0xff,
    (argument >> 8) & 0xff,
    argument & 0xff,
  );
}

export function join(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// ── DER ─────────────────────────────────────────────────────────────────────

export function tlv(tag: number, ...contents: Uint8Array[]): Uint8Array {
  const body = join(...contents);
  const n = body.length;
  const length =
    n < 0x80 ? Uint8Array.of(n) : n < 0x100 ? Uint8Array.of(0x81, n) : Uint8Array.of(0x82, n >> 8, n & 0xff);
  return join(Uint8Array.of(tag), length, body);
}

export const sequence = (...items: Uint8Array[]) => tlv(0x30, ...items);
export const set = (...items: Uint8Array[]) => tlv(0x31, ...items);
export const octetString = (bytes: Uint8Array) => tlv(0x04, bytes);
export const bitString = (bytes: Uint8Array) => tlv(0x03, Uint8Array.of(0), bytes);
export const explicit = (n: number, inner: Uint8Array) => tlv(0xa0 | n, inner);

export function integer(bytes: Uint8Array): Uint8Array {
  let value = bytes;
  while (value.length > 1 && value[0] === 0 && ((value[1] as number) & 0x80) === 0) value = value.slice(1);
  if (((value[0] as number) & 0x80) !== 0) value = join(Uint8Array.of(0), value);
  return tlv(0x02, value);
}

export function oid(dotted: string): Uint8Array {
  const [a, b, ...rest] = dotted.split(".").map(Number) as number[];
  const bytes = [(a as number) * 40 + (b as number)];
  for (const part of rest) {
    const chunk = [part & 0x7f];
    for (let value = part >> 7; value > 0; value >>= 7) chunk.unshift((value & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return tlv(0x06, Uint8Array.from(bytes));
}

export function utcTime(ms: number): Uint8Array {
  const iso = new Date(ms).toISOString(); // 2026-11-03T12:00:00.000Z
  const text =
    iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10) + iso.slice(11, 13) + iso.slice(14, 16) + iso.slice(17, 19);
  return tlv(0x17, new TextEncoder().encode(`${text}Z`));
}

export function name(commonName: string): Uint8Array {
  return sequence(set(sequence(oid("2.5.4.3"), tlv(0x0c, new TextEncoder().encode(commonName)))));
}

/** WebCrypto's r ‖ s as the DER ECDSA-Sig-Value X.509, App Attest and CryptoKit use. */
export function rawToDer(raw: Uint8Array): Uint8Array<ArrayBuffer> {
  const half = raw.length / 2;
  return sequence(integer(raw.slice(0, half)), integer(raw.slice(half))) as Uint8Array<ArrayBuffer>;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
