# ADR 0008: Public reads are cached by TTL-bucketed keys

- Status: Accepted (2026-11-03); changed 2026-11-15 for Feed V1 (one Feed, no Live status)
- Context: the Feed's pages and its community numbers are the same for every reader and read far
  more often than they change (cost C9). Each request carries a guest or access token, so no shared
  cache in front of the Worker can be relied on to keep the response. The analytics service learnt
  that purging by hand goes wrong, that readers should not wait for a refresh, and that requests
  racing on a cold key each ran the query.
- Decision:
  - **The Worker caches what it computes, not the response:** `lib/cache/edge-cache.ts` keeps the
    page's JSON in the Workers Cache under a key that names the page, never the reader or a token.
  - **The key carries its TTL bucket** (`floor(now / ttl)`): it changes when the data goes stale,
    so nothing is purged. A deleted account, a hidden drive or a turned-off Feed leaves every
    cached page within two buckets.
  - **Stale-while-revalidate:** on a miss, the previous bucket's copy answers at once and the new
    one is computed in `waitUntil`; a reader waits on D1 only when neither exists.
  - **One computation per key per isolate:** racing requests share one promise of the JSON text
    (never a `Response`, so no I/O object crosses requests). The first request runs it under its
    own `waitUntil`, so a client going away does not cancel it; a request that joined it and sees
    it fail computes for itself.
  - **What differs by reader is applied after the cache:** the shared page keeps, beside each
    contract item, its author and trips (never sent as they are); a member's page marks their own
    item (`isAuthor`, `tripIds`) and lays on their reactions from one indexed query. A guest's
    answer is `Cache-Control: public, max-age=60`, a member's `private, no-cache`, both with
    `Vary: Authorization`; every read answers with an ETag, and `If-None-Match` gets a 304.
  - **TTLs:** the first Feed page 30 s, later pages 60 s, community stats 5 minutes; a page is
    served for at most two buckets, so a deleted account or a hidden drive leaves the Feed within
    two minutes (the contract says so). Production only: the Workers Cache does nothing on
    workers.dev and locally.
- Reason: the cache costs nothing per read, needs no purge, and no reader ever waits on a refresh.
- Consequence:
  - Pre-warming only what was viewed recently (a Cron touching the first pages) waits until the
    metrics show cold misses.
  - A Feed cursor is sealed (AES-GCM, a deterministic IV), so the next page's key is shared and a
    cursor tells nobody when a drive started.
  - Community numbers are their own read (`GET /v1/feed/stats`) with their own
    cached entry; a later public read (a leaderboard, a share page) reuses `readThrough`.
  - Live status left with Feed V1 (carodo-ios ADR 0007); a real-time "driving now" comes back with
    its own decision (carodo-ios ADR 0010).
