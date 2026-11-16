# carodo-api

Cloudflare Workers API (carodo-ios ADR 0010): TypeScript, Hono and validators by hand (ADR 0003).
D1 holds accounts and sessions, the sharing choices, published drives, Feed items and reactions
(Feed V1); Cron erases accounts and prunes expired rows; Analytics Engine counts; Rate Limiting
bindings limit requests. What is built and what is not:
[implementation status](../../docs/architecture.md#implementation-status).

- Contract: `carodo-ios/docs/api/carodo-api.yaml` (binding; change it first). There is one copy,
  in the iOS repository; this repository reads it by its path in the workspace and never copies it.
- Rules: `carodo-ios/docs/sync.md` (accounts, App Attest, encrypted backup, outbox).
- Schema: [`migrations/0001_baseline.sql`](migrations/0001_baseline.sql), the pre-release baseline,
  edited in place until the first TestFlight build (AGENTS.md rule 4); a change needs the owner's
  approval (P6).
- Seeds: [`seeds/username-policies.sql`](seeds/username-policies.sql), reserved and profane
  usernames as an idempotent upsert: `task db:reset` locally, `task db:policies:<env>` (and every
  deploy) remotely, and the `workers` tests.
- Web contract: [`src/rpc/types/`](src/rpc/types/index.ts), what `WebRpc` answers the web
  (ADR 0001).

Layout, layers and where a new file goes: [`docs/architecture.md`](../../docs/architecture.md).
Cost rules: [`docs/cost.md`](../../docs/cost.md).

The server holds only what is public or shared, plus backups it cannot read (carodo-ios ADR 0010,
0011). Every token comes from an App Attest key; no request is identified by a device id.
