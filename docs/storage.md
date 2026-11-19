# Storage

What the backend keeps, where, and how R2 objects are named (ADR 0006). The server holds only what
is public or shared, plus backups it cannot read (carodo-ios ADR 0010, 0011): never a raw GPS
sample, the route of a trip nobody shared, a location derived from an address, or a device id.

A table arrives with the code that uses it: shares, backups, web pairing, reports and blocks have
none yet. R2 key helpers and the erasure of an account's prefixes exist; no endpoint uploads or
downloads an object ([implementation status](architecture.md#implementation-status)).

## Where each thing lives

| What | Where | Notes |
|---|---|---|
| Accounts, usernames, App Attest keys, sessions | D1 | Secrets as hashes; held usernames (after a deletion or a rename) as HMACs; the sharing choices (`feed_opt_in`, `display_as`, `show_vehicle`); renames in `username_changes` for 30 days |
| Username policies (`username_policies`) | D1, seeded | Reserved and profane names (`exact` or `contains`), upserted from `apps/api/seeds/username-policies.sql` |
| Drives published to the Feed (`drives`) | D1 | Summary; `ended_at` on a quarter hour as the device sent it (the only time of a drive, P9); local day and start hour, part of day, weather, the car's make and model, the abstract shape as sent; exact server audit times, never sent. Never a route, a place or a speed. Deleted an hour after it leaves the 7-day Feed, by Stop sharing or by account deletion; an unpublished drive keeps only a tombstone (trip, revision, end) until then |
| Feed items (`feed_items`) | D1 | One per person and local day, a random id; its newest visible drive's end (`last_ended_at`); others' pages order it by its newest released drive. Deleted with the window, Stop sharing or the account |
| Reactions (`reactions`) | D1 | One per reader and item; only counts leave the server |
| Feed pages and community stats | Workers Cache | The JSON under a TTL-bucketed key, never a reader or a token in it (ADR 0008) |
| Encrypted backups, shared trips, avatars | R2 (key layout below) | No endpoint and no table yet |
| Counters and request metrics | Analytics Engine ([`metrics.md`](metrics.md)) | |

A blob never goes in D1 (carodo-ios ADR 0010): a shared route is up to 2,000 points with their
times and speeds, tens of kilobytes of JSON, and D1 limits a database's size.

## R2

One bucket per environment, bound as `BLOBS`: `carodo-local` locally, `carodo-staging` for staging
and `carodo` for production on the Cloudflare account (ADR 0004).
The bucket is private; objects reach a reader only through a Worker.

One more bucket, `carodo-media`, is public on `https://media.carodo.app` and holds only the website's
own videos (`apps/web/media/*.mp4`, synthetic showcase drives): no person's data ever goes there.
Its keys are `<name>.<hash of the bytes>.mp4`, cached for a year; no Worker binds it
(docs/operations/deploy.md).

### Keys

```
backups/<account_id>/<trip_id>/r<revision>.cbk     encrypted envelope (CBK1, carodo-ios docs/sync.md)
shares/<share_id>/route.v1.geojson                 the shared route, GeoJSON as the contract sends it
shares/<share_id>/preview.v1                       the Open Graph image (type in shares.preview_type)
avatars/<account_id>/<avatar_id>.v1                a profile photo
```

Every key is spelled in one place, `apps/api/src/lib/storage/keys.ts`. The rules:

1. **Only UUIDs in a key,** never a share token, a username or a coordinate: a key can surface in a
   listing or a log. A share is named by its `id`; its `token` stays the secret in the link.
2. **Never overwritten:** a new content is a new key. A backup's next revision is written first,
   then D1 points at it, then a job deletes the old one; a failure in between leaves D1 pointing at
   an object that exists.
3. **The owner first** (`backups/<account_id>/`, `avatars/<account_id>/`), so erasing an account lists
   and deletes by prefix. A share's objects are found through its row. `list()` runs in jobs only,
   never on a request path (cost C12).
4. **The format version in the name** (`.v1`, `CBK1`): a new format is a new name, and old objects
   are read as they are.
5. **D1 keeps no key it can compute** from an id: `shares` has no route or image column.

## Shared trips (decided, not built)

A share page is read by many people, wherever the link travels, so it is served from the edge, but
"revoke" must work within a minute (P5):

- **The page** (by token) is cached briefly (about a minute). Building it reads the share's row by
  its key and answers 404 once `revoked_at` is set.
- **The route and the preview** (by share id) never change, so they are cached for good
  (`immutable`). The id appears only inside the page: someone holding a revoked link gets the 404
  and never learns it.
- The route is stored as received; the edge compresses it when it serves it, so the Worker spends
  no CPU on compression.
- Revoking or erasing deletes the objects through a job; a cached copy expires on its own.

A cache miss costs one D1 read by key and one R2 object read; nothing is measured until it is built.

## No KV, yet

linkto reads KV before D1 on its redirect, because every click waits on it, from anywhere. Here no
read is like that, so there is no KV (ADR 0006):

- **The session check must not use it:** KV takes about a minute to reach every location, and
  "Sign out everywhere" and deletion must stop a session at once. It stays one D1 read by key.
- **The Feed and its community stats already use the Workers Cache** (ADR 0008), as share pages
  and leaderboards will: KV would be a second cache to keep in step.
- **KV is the dearer read:** a KV read costs far more than a D1 row read, and a cache in KV is a
  second write path to keep in step (write D1, then delete the key, queue a failed delete in
  `pending_ops`). It buys latency, not savings.

D1 read replication (not used yet) comes before KV. KV is added, with
the owner's approval (P6), when `carodo_metrics` shows one of these:

1. Share pages read often from far from D1, with slow misses: KV caches a share's metadata by token,
   written after D1 and deleted on revoke, while `revoked_at` is still read from D1.
2. Leaderboards and stats read globally at volume: the hourly job writes each precomputed page to
   KV once, and every location reads it nearby.

Either way KV follows cost C8: a cache of D1, written only when a value changes, never a counter, a
lock, a rate limit or a job cursor.
