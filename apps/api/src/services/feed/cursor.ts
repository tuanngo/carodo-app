import { deriveAesKey, deriveHmacKey, LABEL_FEED_CURSOR, LABEL_FEED_CURSOR_IV } from "../../lib/crypto/secret-key";
import { concat, fromBase64Url, toBase64Url, utf8 } from "../../lib/encoding/bytes";
import { fail, ok, type Result } from "../shared/result";

/**
 * A Feed page's cursor: the last item's key (`sort_hour`, `id`), sealed with AES-GCM. A readable
 * cursor would tie an item's id to its hour and could be crafted to probe the order; a sealed one
 * does neither. The IV is an HMAC of the key, so the same position always seals to the same text
 * and a cached page's next page shares its cache key.
 */

export interface FeedPosition {
  sortHour: number;
  itemId: string;
}

/** Before every item: the first page. */
export const FIRST_POSITION: FeedPosition = { sortHour: Number.MAX_SAFE_INTEGER, itemId: "" };

export async function sealCursor(root: string, position: FeedPosition): Promise<string> {
  const plain = utf8(`${position.sortHour}:${position.itemId}`);
  const mac = await crypto.subtle.sign("HMAC", await deriveHmacKey(root, LABEL_FEED_CURSOR_IV), plain);
  const iv = new Uint8Array(mac.slice(0, 12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await deriveAesKey(root, LABEL_FEED_CURSOR),
    plain,
  );
  return toBase64Url(concat(iv, new Uint8Array(sealed)));
}

export async function openCursor(root: string, cursor: string): Promise<Result<FeedPosition>> {
  const refused = fail("validation", "cursor is not valid.");
  if (cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return refused;
  try {
    const bytes = fromBase64Url(cursor);
    if (bytes.length < 12 + 16) return refused;
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      await deriveAesKey(root, LABEL_FEED_CURSOR),
      bytes.slice(12),
    );
    const match = /^(\d{1,16}):([0-9a-f-]{36})$/.exec(new TextDecoder().decode(plain));
    if (!match) return refused;
    return ok({ sortHour: Number(match[1]), itemId: match[2] as string });
  } catch {
    return refused;
  }
}
