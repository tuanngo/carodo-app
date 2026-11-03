# carodo-api

Cloudflare Workers API (carodo-ios ADR 0010): TypeScript, Hono, Zod; D1 for public data and
metadata, R2 for blobs (encrypted backups, share images, avatars), Durable Objects for live status
and rate limits, Queues and Cron for jobs, Analytics Engine for counters.

- Contract: `carodo-ios/docs/api/carodo-api.yaml` (binding; change it first).
- Rules: `carodo-ios/docs/sync.md` (accounts, App Attest, encrypted backup, outbox).
- Schema: [`migrations/0001_baseline.sql`](migrations/0001_baseline.sql) (draft for review).
- Web contract: [`src/rpc/types/`](src/rpc/types/index.ts), what `WebRpc` answers the web
  (ADR 0001).

| Path | Holds |
|---|---|
| `src/index.ts` | The Worker's exports: `fetch` and the `WebRpc` entrypoint |
| `src/app.ts` | HTTP routes for the iOS app; errors are RFC 9457 problem documents |
| `src/rpc/` | `WebRpc` and its contract |
| `migrations/` | D1 migrations, applied by `wrangler d1 migrations apply` and by the tests |
| `test/` | Tests in workerd, against a D1 built from `migrations/` |

The server holds only what is public or shared, plus backups it cannot read (carodo-ios ADR 0010,
0011). Every token comes from an App Attest key; no request is identified by a device id.
