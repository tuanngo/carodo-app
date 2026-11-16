import { utf8 } from "../encoding/bytes";

/**
 * One configured root (`SECRET_KEY`), one derived key per use. Each use has its own label, so
 * rotating a key means changing one label and touches nothing else. The server encrypts no
 * person's data: backups are sealed on the device (carodo-ios ADR 0011); this signs, and seals the
 * server's own state handed to a client (a Feed cursor), the role Django's `SECRET_KEY` and Rails'
 * `secret_key_base` have. Hence not "encryption key".
 */

export const LABEL_GUEST_TOKEN = "carodo:guest-token:v1";
export const LABEL_ACCESS_TOKEN = "carodo:access-token:v1";
export const LABEL_USERNAME_HOLD = "carodo:username-hold:v1";
export const LABEL_FEED_CURSOR = "carodo:feed-cursor:v1";
export const LABEL_FEED_CURSOR_IV = "carodo:feed-cursor-iv:v1";

/** One derivation per root and label for the life of the isolate: not request state, a cache. */
const derived = new Map<string, Promise<CryptoKey>>();

/** An HMAC-SHA-256 key from the root, bound to `label`. */
export function deriveHmacKey(root: string, label: string): Promise<CryptoKey> {
  return derive(root, label, { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign", "verify"]);
}

/** An AES-256-GCM key from the root, bound to `label`: for the server's own state, never a person's data. */
export function deriveAesKey(root: string, label: string): Promise<CryptoKey> {
  return derive(root, label, { name: "AES-GCM", length: 256 }, ["encrypt", "decrypt"]);
}

function derive(
  root: string,
  label: string,
  algorithm: { name: "HMAC"; hash: string; length: number } | { name: "AES-GCM"; length: number },
  usages: ("sign" | "verify" | "encrypt" | "decrypt")[],
): Promise<CryptoKey> {
  const cacheKey = `${algorithm.name} ${label} ${root}`;
  const cached = derived.get(cacheKey);
  if (cached) return cached;

  const key = (async () => {
    const material = await crypto.subtle.importKey("raw", utf8(root), "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8(label) },
      material,
      algorithm,
      false,
      usages,
    );
  })();
  derived.set(cacheKey, key);
  return key;
}
