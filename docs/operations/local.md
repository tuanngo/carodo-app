# Local development

Needs Node at the version in `.node-version` (24) and pnpm installed once (`npm i -g pnpm`, no
corepack): pnpm reads `packageManager` in `package.json` and runs that exact version itself. No
Docker and no database server: `wrangler dev` runs workerd with the configured local bindings,
including D1 and R2; local state is under each app's `.wrangler/` (gitignored). No Durable Object
or Queue is configured today.

```sh
task install             # pnpm install
task db:reset            # create the local D1 database from apps/api/migrations, then apps/api/seeds
task dev                 # api on http://localhost:8080, web on http://localhost:8081
task dev:lan             # same on 0.0.0.0 (:8080, :8081) for another device on a trusted LAN
task check               # lint, typecheck, test: run before committing
```

From the workspace root the same tasks are `task app:<name>`.

## Local settings

The top level of each `wrangler.jsonc` is local; `--env staging` and `--env production` are the
deployed ones (ADR 0004; how they are deployed: [`deploy.md`](deploy.md)). Per-machine values go in `apps/api/.dev.vars` (gitignored), which
overrides `vars`; start from the example:

```sh
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

- `APP_ID`: `<Team ID>.app.carodo.ios`, with the Team ID the iOS app is signed with on this Mac
  (`DEVELOPMENT_TEAM` in carodo-ios `Configs/Local.xcconfig`; a Personal Team works).
- `SECRET_KEY`: any long random string (`openssl rand -base64 32`); the root every server key is derived from (one HKDF label per use), local only.

## Jobs

The api's crons (hourly: erase deleted accounts, prune expired rows; every quarter hour: list
the drives others may now see on the Feed) do not fire under `wrangler dev`. Run them by hand
while `task dev` is up (a drive you publish locally shows to others only after the second):

```sh
curl "localhost:8080/cdn-cgi/handler/scheduled?cron=17+*+*+*+*"
curl "localhost:8080/cdn-cgi/handler/scheduled?cron=*/15+*+*+*+*"
```

Each run leaves a row per job in `job_runs` and a `job.finished` log line.

## How the two Workers meet locally

Each `wrangler dev` registers itself in the local dev registry; the web's `API` binding connects to
the running api (`env.API (carodo-api-local#WebRpc) … [connected]` in the log). If the api is not
running, the binding reports `[not connected]` and every call to it fails.

## Types

`worker-configuration.d.ts` in each app is generated and committed. After changing a
`wrangler.jsonc`, run `task types`; `task typecheck` fails while it is stale. The web's `Env`
is written by hand in `apps/web/src/env.ts` (ADR 0001): keep it in step with its
`wrangler.jsonc`.

## Tests

The api has two Vitest projects (`apps/api/vitest.config.ts`):

| Project | Where | What goes in it | Runs in |
|---|---|---|---|
| `unit` | `test/unit/` | Plain code with no Cloudflare runtime: parsers, encoders, validators, tokens | Node threads, milliseconds |
| `workers` | `test/workers/` | Anything with a binding, D1, a route, a job, or the Workers runtime's own behaviour (App Attest's Web Crypto) | workerd (`@cloudflare/vitest-plugin`) |

`test/support/` holds what tests share (encoders, a stand-in Apple CA, a test device); it imports
with `.ts` so `scripts/` can run it in Node. `test/fixtures/` holds data tests read, such as the
App Attest vectors (the original; the iOS tests keep a copy, and
`test/unit/attest/vectors-copy.node.test.ts` fails when it drifts, or skips when carodo-ios is
not next to this repository). A unit test that uses Node's own APIs (`node:fs`) is named
`*.node.test.ts` and type-checked by `tsconfig.node.json`.

```sh
task test                                # everything: the gate, inside `task check`
pnpm --filter @carodo/api test:unit      # the fast loop while writing plain code
pnpm --filter @carodo/api test:workers
task test:changed                        # tests whose imports changed since HEAD
```

`test:changed` follows imports, and a route test reaches the code through
`exports.default.fetch()`, which no import shows: it is a loop, never the gate.

The `workers` project applies `apps/api/migrations` and then `apps/api/seeds` (one statement per
file, read by `vitest.config.ts`) to its D1 before each file. Tests share that
database within a file: use unique names and query by the ids a test made, never "the only row".
Every statement the api's `src/` prepares during a `workers` test file is run through
`EXPLAIN QUERY PLAN` when the file ends, and a full table scan fails it (`test/workers/setup.ts`,
[`../cost.md`](../cost.md) C1): a missing index shows up in `task check`, not on the bill. Bindings the suite
depends on are fixed in `vitest.config.ts`, because the pool reads `.dev.vars`;
a credential the suite must not use is declared empty there, not left out. The web's tests use a
stand-in `carodo-api-local` defined in `apps/web/vitest.config.ts`.

**Before raising Vitest or `@cloudflare/vitest-plugin`:** count workerd processes during a run
with two workers. It must stay near the baseline plus two; a count that climbs with the number of
files is the leak that took linkto's suite down on Vitest 5 with plugin 1.4.8 (one workerd per
file, kept until the run ends). On 1.7.0 with Vitest 5.1.0 it stays at baseline plus two.

```sh
cd apps/api && pnpm exec vitest run --project workers --maxWorkers=2 &
while sleep 0.2; do pgrep -f workerd | wc -l; done   # Ctrl-C when the run ends
```

## Dependencies

Every version is pinned once in `pnpm-workspace.yaml` (`catalog:`). pnpm refuses a release younger
than its minimum release age; take the newest release that has passed it rather than adding an
exclusion. A new entry is a new dependency and needs the owner's approval.

## Secrets

`SECRET_KEY` is required now: it is the root for the derived keys used by tokens, held usernames
and Feed cursors. Set it in `apps/api/.dev.vars` locally (gitignored; start from
`.dev.vars.example`). `APP_ID` is an application identifier, not a secret.

For a deployed environment, set `SECRET_KEY` through the wrapper, for example
`task wrangler:staging -- api secret put SECRET_KEY` ([deploying](deploy.md)). Never commit secret
values or place them in `wrangler.jsonc`; `secrets.required` lists names only.
