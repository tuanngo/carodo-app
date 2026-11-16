# ADR 0006: The network caches; R2 holds objects by id; Analytics Engine counts

- Status: Accepted (2026-11-03)
- Context: the iPhone does the GPS work and keeps the private history (carodo-ios ADR 0003, 0010).
  What the backend serves is small, public or shared, and read far more often than written: share
  pages that travel anywhere a link is pasted, the Feed and leaderboards, and backups restored in
  bulk. Each Cloudflare product is billed differently (docs/cost.md).
- Decision:
  - **D1 holds rows, never blobs.** A shared route, a backup and an avatar are R2 objects in one
    bucket per environment (`BLOBS`), keyed by UUIDs only (never a token, a username or a
    coordinate), never overwritten, the owner first in the key, the format version in the name
    (docs/storage.md). R2 has no egress fee, so restoring a backup costs no bandwidth.
  - **What many people read is served from the edge.** A share page by token is cached about a
    minute and checks `revoked_at` when built; its route and preview, by share id, are immutable and
    cached for good. Feed and leaderboard reads carry ETags and use the Workers Cache when public (ADR 0008).
  - **Analytics Engine counts:** request metrics (`carodo_metrics`, in place of invocation
    logs) and product events (`carodo_events`), with no identifier, token or location in a
    data point, and positions that are append-only (docs/metrics.md).
  - **Near the drivers:** remote D1 databases are created in `apac` (most drivers are in Vietnam;
    a location is chosen only at creation). The api runs with Smart Placement in staging and
    production, near D1, since a request calls it more than once; read replication comes with the
    Feed when traffic needs it.
  - **The edge protects before the Worker runs:** DDoS protection, WAF rate-limiting rules on
    `/v1/auth/*`, Turnstile for the web pairing; App Attest proves the app (carodo-ios ADR 0009).
  - **No Durable Object yet:** one comes only where one place must decide (docs/cost.md C11);
    Feed V1 has no such place.
  - **No KV yet:** no read here waits like linkto's redirect does; the session check must stay
    consistent, the Workers Cache serves public reads for nothing, and a KV read costs more than a
    D1 row. D1 read replication comes first; KV only when the metrics show slow far-away misses
    (docs/storage.md "No KV, yet").
- Reason: the product's load is reads of public things and bulk downloads of private ciphertext;
  the edge cache and R2 serve both at almost no cost, and nothing in that path ever learns where a
  person drove.
- Consequence:
  - `shares` names its objects by `id`; the link's `token` is a separate unique column.
  - Erasing an account deletes its objects first, then its rows (`account.erase`).
  - Three new bindings per environment (`BLOBS`, `EVENTS`, `METRICS`); the buckets and datasets are
    created by the account owner before the first deploy.
