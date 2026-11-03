# CARODO App

The backend of CARODO, two Cloudflare Workers in one pnpm workspace (carodo-ios ADR 0010):

| Path | Holds |
|---|---|
| `apps/api/` | `carodo-api`: the HTTP API the iOS app calls (TypeScript, Hono; D1, R2, Durable Objects, Queues): accounts, Feed publishing, share links and end-to-end encrypted backups (carodo-ios ADR 0011). Also exports `WebRpc` for the web |
| `apps/web/` | `carodo-web`: the lightweight public trip share page and its preview, HTML rendered on the server. It owns no data and reads only through `WebRpc` (ADR 0001) |
| `packages/` | Code both Workers run, created when they first need the same code |
| `docs/` | The backend's decisions and runbooks |
| `Taskfile.yml` | Shortcuts (`task --list`); from the workspace root `task app:<name>` |

The iOS app stays local-first (carodo-ios ADR 0003): backup and sync go to the person's iCloud
(carodo-ios ADR 0005); the backend holds only what is public or shared, and is never a dependency
of trip recording. The contract is `../carodo-ios/docs/api/carodo-api.yaml` and the sync model
`../carodo-ios/docs/sync.md` until this repo keeps its own copy in `docs/api/`; change them before
implementing clients and servers.

## Run it locally

No Docker: `wrangler dev` emulates D1, R2, Durable Objects and Queues on your machine.

```sh
corepack enable && task install
task db:reset
task dev        # api :8080, web :8081
task check      # lint, typecheck, test
```

More in [`docs/operations/local.md`](docs/operations/local.md). Rules for changing code are in
[`AGENTS.md`](AGENTS.md).
