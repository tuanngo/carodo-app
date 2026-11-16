/**
 * R2 object keys, the one place they are spelled (docs/storage.md). A key is
 * `<kind>/<owner or id>/<object>.<format version>`, made of UUIDs only: never a share token, a
 * username or a coordinate, since keys can surface in listings and logs. An object is never
 * overwritten: a new revision is a new key.
 */

export const blobKeys = {
  /** An encrypted backup envelope (CBK1, carodo-ios ADR 0011), one key per revision. */
  backup: (accountId: string, tripId: string, revision: number) => `backups/${accountId}/${tripId}/r${revision}.cbk`,
  /** A shared trip's privacy-trimmed route, GeoJSON as the contract defines it. Immutable. */
  shareRoute: (shareId: string) => `shares/${shareId}/route.v1.geojson`,
  /** A shared trip's Open Graph image, rendered on the device; its type is in `shares.preview_type`. */
  sharePreview: (shareId: string) => `shares/${shareId}/preview.v1`,
  /** A profile photo; a new upload is a new id, so each key can be cached for good. */
  avatar: (accountId: string, avatarId: string) => `avatars/${accountId}/${avatarId}.v1`,
};

/** Everything stored under an account's own prefixes; a share is found through D1 instead. */
export function accountPrefixes(accountId: string): string[] {
  return [`backups/${accountId}/`, `avatars/${accountId}/`];
}
