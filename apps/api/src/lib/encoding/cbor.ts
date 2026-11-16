import type { Bytes } from "./bytes";

/**
 * A CBOR decoder (RFC 8949) for exactly what App Attest sends: unsigned and negative integers,
 * byte and text strings, arrays, maps, and the simple values false, true and null, all of definite
 * length. Anything else (floats, tags, indefinite lengths) is refused, so a crafted object cannot
 * reach a path no test covers. Bounded by its input: every length is checked before it is read.
 */

export type CborValue = number | Bytes | string | CborValue[] | Map<CborValue, CborValue> | boolean | null;

export class CborError extends Error {}

/** Nesting deeper than any App Attest object, so recursion stays bounded. */
const MAX_DEPTH = 16;

export interface Decoded {
  value: CborValue;
  /** The offset just past the item: a caller reading a CBOR item inside other bytes resumes here. */
  end: number;
}

/** Decodes one item starting at `offset`. */
export function decodeCborItem(bytes: Bytes, offset = 0): Decoded {
  return readItem(bytes, offset, 0);
}

/** Decodes `bytes`, which must hold exactly one item. */
export function decodeCbor(bytes: Bytes): CborValue {
  const { value, end } = readItem(bytes, 0, 0);
  if (end !== bytes.length) throw new CborError("trailing bytes");
  return value;
}

function readItem(bytes: Bytes, offset: number, depth: number): Decoded {
  if (depth > MAX_DEPTH) throw new CborError("too deep");
  const initial = byteAt(bytes, offset);
  const major = initial >> 5;
  const info = initial & 0x1f;
  const head = readArgument(bytes, offset + 1, info, major);
  let cursor = head.end;
  const argument = head.value;

  switch (major) {
    case 0:
      return { value: argument, end: cursor };
    case 1:
      return { value: -1 - argument, end: cursor };
    case 2:
    case 3: {
      const end = cursor + argument;
      if (end > bytes.length) throw new CborError("truncated string");
      const slice = bytes.slice(cursor, end);
      if (major === 2) return { value: slice, end };
      try {
        return { value: new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(slice), end };
      } catch {
        throw new CborError("invalid UTF-8");
      }
    }
    case 4: {
      if (argument > bytes.length - cursor) throw new CborError("array longer than its input");
      const items: CborValue[] = [];
      for (let i = 0; i < argument; i++) {
        const item = readItem(bytes, cursor, depth + 1);
        items.push(item.value);
        cursor = item.end;
      }
      return { value: items, end: cursor };
    }
    case 5: {
      if (argument * 2 > bytes.length - cursor) throw new CborError("map longer than its input");
      const map = new Map<CborValue, CborValue>();
      for (let i = 0; i < argument; i++) {
        const key = readItem(bytes, cursor, depth + 1);
        if (typeof key.value !== "string" && typeof key.value !== "number") throw new CborError("unsupported map key");
        if (map.has(key.value)) throw new CborError("duplicate map key");
        const value = readItem(bytes, key.end, depth + 1);
        map.set(key.value, value.value);
        cursor = value.end;
      }
      return { value: map, end: cursor };
    }
    case 7:
      if (info === 20) return { value: false, end: cursor };
      if (info === 21) return { value: true, end: cursor };
      if (info === 22) return { value: null, end: cursor };
      throw new CborError("unsupported simple value");
    default:
      throw new CborError("unsupported major type");
  }
}

/** The argument that follows an initial byte; lengths past 2^53 are refused, as no input holds them. */
function readArgument(bytes: Bytes, offset: number, info: number, major: number): { value: number; end: number } {
  if (major === 7) {
    if (info < 24) return { value: info, end: offset };
    throw new CborError("unsupported simple value");
  }
  if (info < 24) return { value: info, end: offset };
  const width = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0;
  if (width === 0) throw new CborError("indefinite or reserved length");
  if (offset + width > bytes.length) throw new CborError("truncated argument");
  let value = 0;
  for (let i = 0; i < width; i++) value = value * 256 + (bytes[offset + i] as number);
  if (!Number.isSafeInteger(value)) throw new CborError("argument too large");
  return { value, end: offset + width };
}

function byteAt(bytes: Bytes, offset: number): number {
  const byte = bytes[offset];
  if (byte === undefined) throw new CborError("truncated");
  return byte;
}

/** A text-keyed map's entry, or undefined when the value is not a map or lacks the key. */
export function mapGet(value: CborValue | undefined, key: string | number): CborValue | undefined {
  return value instanceof Map ? value.get(key) : undefined;
}
