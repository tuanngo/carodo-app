# CARODO App

The backend of CARODO, two Cloudflare Workers in one pnpm workspace (carodo-ios ADR 0010):

| Path | Holds |
|---|---|
| `apps/api/` | `carodo-api`: TypeScript/Hono API: App Attest, accounts and sessions, drive publishing, the Feed and its reactions and stats; Cron erases and prunes. D1, R2, rate limits and Analytics Engine are bound; no Durable Object or Queue. Share and backup endpoints are not implemented. |
| `apps/web/` | `carodo-web`: the landing page, Privacy and Terms (Vietnamese and English), behind an API service binding; the web owns no store (ADR 0001). Share pages are not implemented. |
| `packages/` | Code both Workers run, created when they first need the same code |
| `docs/` | The backend's decisions and runbooks |
| `Taskfile.yml` | Shortcuts (`task --list`); from the workspace root `task app:<name>` |

The iOS app stays local-first (carodo-ios ADR 0003): backup and sync go to the person's iCloud
(carodo-ios ADR 0005); the backend holds only what is public or shared, and is never a dependency
of trip recording. The contract is `../carodo-ios/docs/api/carodo-api.yaml` and the sync model
`../carodo-ios/docs/sync.md`, one copy each, read in place and never copied here; change them before
implementing clients and servers.

The contract describes more than is built: what exists today is in
[implementation status](docs/architecture.md#implementation-status).

## Run it locally

No Docker: `wrangler dev` runs the Workers and emulates their configured bindings locally,
including D1 and R2. No Durable Object or Queue is configured today.

```sh
task install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # then set APP_ID and SECRET_KEY
task db:reset
task dev        # api :8080, web :8081
task check      # lint, typecheck, test
```

More in [`docs/operations/local.md`](docs/operations/local.md). Rules for changing code are in
[`AGENTS.md`](AGENTS.md).
