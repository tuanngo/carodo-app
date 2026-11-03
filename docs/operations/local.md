# Local development

Needs Node at the version in `.node-version` (24) and corepack, which provides the pnpm version in
`package.json`. No Docker and no database server: `wrangler dev` runs workerd with local D1,
R2, Durable Objects and Queues, stored under each app's `.wrangler/` (gitignored).

```sh
corepack enable          # once per machine
task install             # pnpm install
task db:reset            # create the local D1 database from apps/api/migrations
task dev                 # api on http://localhost:8080, web on http://localhost:8081
task check               # lint, typecheck, test: run before committing
```

From the workspace root the same tasks are `task app:<name>`.

## How the two Workers meet locally

Each `wrangler dev` registers itself in the local dev registry; the web's `API` binding connects to
the running api (`env.API (carodo-api#WebRpc) … [connected]` in the log). If the api is not
running, the binding reports `[not connected]` and every call to it fails.

## Types

`worker-configuration.d.ts` in each app is generated and committed. After changing a
`wrangler.jsonc`, run `task types`; `task typecheck` fails while it is stale. The web's `Env`
is written by hand in `apps/web/src/env.ts` (ADR 0001): keep it in step with its
`wrangler.jsonc`.

## Tests

`vitest` runs inside workerd through `@cloudflare/vitest-plugin`, with the bindings from each
`wrangler.jsonc`. The api's tests apply `apps/api/migrations` to a fresh D1 before running. The
web's tests use a stand-in `carodo-api` defined in `apps/web/vitest.config.ts`.

## Dependencies

Every version is pinned once in `pnpm-workspace.yaml` (`catalog:`). pnpm refuses a release younger
than its minimum release age; take the newest release that has passed it rather than adding an
exclusion. A new entry is a new dependency and needs the owner's approval.

## Secrets

None yet. When one is needed: `.dev.vars` locally (gitignored, with a committed
`.dev.vars.example` naming every key), `wrangler secret put` remotely, never in `wrangler.jsonc`.
