# carodo-app

The backend of CARODO, a private drive journal: two Cloudflare Workers that hold only what is
public or shared, plus backups they cannot read (carodo-ios ADR 0010, 0011). This file is the
complete set of rules for this repository; `docs/` holds its decisions and runbooks. Product-wide
decisions are carodo-ios ADRs, cited as "carodo-ios ADR NNNN".

The handbook (`carodo-handbook/`, a separate repo next to this one) holds vision, roadmap and plans: read
it for intent, never cite it from code or docs here.

Stack: TypeScript, Hono, Cloudflare Workers (D1, R2, Durable Objects, Queues, Cron), pnpm
workspace, Biome, Vitest in workerd.

## The loop

```sh
task install      # pnpm install (pnpm runs the version pinned in package.json)
task dev          # api :8080, web :8081, the API binding connects them
task test         # every test: unit (Node) and workers (workerd)
task test:changed # the tests whose imports changed; a loop, never the gate
task typecheck    # generated binding types current, then tsc for both Workers
task lint         # Biome: format, lint, import boundaries; changes nothing
task format       # Biome: format and fix
task check        # lint + typecheck + test; must pass before a commit
task db:reset     # local D1 from apps/api/migrations, then apps/api/seeds
task deploy:staging    # check, migrate, seed policies, deploy both Workers to staging (.env.deploy)
task deploy:production # check, migrate, seed policies, deploy both Workers to production (.env.deploy)
```

From the workspace root they are `task app:<name>`; each wraps a pnpm script. Setup and how the
Workers meet locally: `docs/operations/local.md`; deploying: `docs/operations/deploy.md` (every
deployed command goes through `scripts/wrangler.mjs`, never a bare `wrangler`).

## Architecture

```
apps/api/src/  routes/ rpc/ jobs/     transports: HTTP for the app, WebRpc for the web, Cron
               http/                  what HTTP routes share: auth, problems, rate limits, bodies
               services/<domain>/     the rules (accounts, auth, attest, jobs; shared/ for Result)
               lib/<area>/            plain helpers: encoding, crypto, observability, platform, storage
apps/api/      migrations/ (D1), seeds/ (policy rows), scripts/, test/{unit,workers}/<domain>/, test/{support,fixtures}/
apps/web/      carodo-web: landing, legal pages (later share pages), Hono JSX, no store; reads only env.API (WebRpc)
packages/      code both Workers run; created when first needed
```

Dependency direction: `routes | rpc | jobs → http → services → lib → D1 / R2 / Durable Object`. A
service returns a result and never sees a `Response`; transports authenticate, rate-limit, call it
and map the result (ADR 0001). Biome refuses an import against the direction. Folders by layer and
domain, never a flat `src/`: where a new file goes, and where the patterns come from (linkto and
its analytics service), is [`docs/architecture.md`](docs/architecture.md).

## Product invariants — shared with the iOS app

P1. **A trip records without network or account.** The backend is never on the recording path;
    trip ids are the device's UUIDs, never coupled to an account id.
P2. **GPS distance is not the odometer.** Store and show them as different things.
P3. **Units at rest are SI:** meters, meters/second; instants as INTEGER Unix ms in D1, RFC 3339
    UTC strings in JSON. Column names carry the unit (`distance_m`, `duration_s`, `_at`).
P4. **CarPlay disconnect never ends a trip by itself** (an app concern; nothing here infers it).
P5. **Location history is private.** No raw coordinates, tokens or ciphertext in logs or
    analytics; sharing is opt-in and revocable, and a shared route arrives privacy-trimmed. The
    Feed shows how people drive, never where: at most an opt-in province and an abstract shape
    sent by the device (carodo-ios ADR 0007). Never commit real location
    traces, licence plates, API keys, signing keys or account secrets.
P6. **Contracts need the owner's approval first:** API contracts (`carodo-api.yaml`, the web
    contract), the D1 schema, Worker names, routes and domains, bindings, and any new dependency,
    Worker, package or Cloudflare product (explain why before adding it).
P7. **The backend holds only what is public or shared, and is never a dependency.** Private
    history reaches it only as ciphertext the operator cannot read (carodo-ios ADR 0011). Only the
    genuine app calls the API: every token comes from an App Attest key, never a device or
    installation id.
P8. **No AI attribution** in commits or PR descriptions: no `Co-Authored-By` for an AI tool, no
    session link, no "Generated with" footer.
P9. **Exact at rest, coarse on the way out.** The backend may keep exact times for its own logic
    (a drive's `started_at`, a badge's `earned_at`, audit columns such as `published_at`); nothing
    it sends to anyone else carries a time finer than the hour, and every such time goes through
    `services/shared/coarse-time.ts` (carodo-ios ADR 0007). The exceptions, and only these:
    - **To the person themselves:** their account export (as they sent it), their own sessions
      and devices, their own settings.
    - **Live status, while they opt in:** the elapsed time in whole minutes (not in Feed V1).
    - **Times of the protocol, not of a person:** token and challenge expiries, `Retry-After`, a
      board's period dates; a person's local day (`localDate`) only as a day.
    Logs and analytics never tie a time to an account (they carry no account id).

## Backend rules

1. **The web owns no store.** `carodo-web` binds only `API`; it reaches the api through `WebRpc`,
   never its public URL, and imports only `@carodo/api/web-contract` (ADR 0001; Biome enforces).
2. **One home per rule.** Validation and business rules live in an api service; a route, RPC
   method or page holds none.
3. **Bindings are generated.** `wrangler types` writes `worker-configuration.d.ts` (committed);
   never hand-write the api's `Env`. The web's `src/env.ts` is the one hand-written exception.
4. **Pre-release, the schema is edited in place.** Until the first TestFlight build, change
   `apps/api/migrations/0001_baseline.sql` instead of adding a migration, and reset local D1
   (`task db:reset`). After it, migrations are additive and a shipped one is never edited.
   D1 bills rows read: every index serves a named query. **Constraints, after linkto** (owner,
   2026-11-15): an account and what it owns are tied by foreign keys with `ON DELETE CASCADE`
   (erasing the account row erases the rest); an auxiliary table (policies, caches, logs) has none;
   `CHECK` only on a system job table's status. Every other fixed set is lowercase text
   (`'anonymous'`, `'rain'`) validated by its service.
   Rows the product needs from day one (username policies) are an idempotent upsert in
   `apps/api/seeds/`, applied by `task db:reset`, the tests and every deploy.
5. **Pull, never poll** (carodo-ios ADR 0010): nothing is written per GPS fix; responses carry
   ETags and are cached; leaderboards are precomputed.
6. **Errors are RFC 9457 problem documents** with a stable `code` (the contract's `Problem`).
7. **Workers hygiene:** structured JSON logs (`console.log(JSON.stringify({...}))`), async work
   awaited or in `ctx.waitUntil`, no module-level request state, `crypto.randomUUID()` /
   `getRandomValues()` for ids and tokens, constant-time comparison for secrets, secrets via
   `.dev.vars` and `wrangler secret put` only.
8. **The server never locates anyone** (ADR 0002): nothing from `request.cf` but `country` (per
   request, never stored on an account) and `colo` is read, stored or logged. A drive's area comes
   only from the device, opt-in (`DriveArea`).
9. **Never `await` in a loop.** D1 statements that belong together go in one `db.batch()` (one
   round trip, one transaction); independent work runs together through `Promise.all` /
   `allSettled`; a list of ids travels as one JSON value read with `json_each(?)` (D1 binds at most
   100 values per statement). Work too large for one run is bounded (`LIMIT`) and finished by the
   next run, not looped. Loops without `await` over bytes in memory (parsers) are fine.

## Cost rules: every request, row and millisecond is billed

The how, with examples and the measuring: [`docs/cost.md`](docs/cost.md). Read it before writing
a query, a route, a job or a binding.

C1. **Every D1 query goes through an index;** keyset pagination, no `OFFSET`, no `COUNT(*)` on a
    request path. The `workers` tests fail on a full table scan.
C2. **Every foreign key column on the child side has an index;** every index names its query.
C3. **Writes are facts, not traffic:** nothing written per read or per request; counters go to
    Analytics Engine.
C4. **One round trip:** a `db.batch()` for statements that belong together, no `await` in a loop.
C5. **A partial index's column is compared to a literal,** never a bound value.
C6. **Cheapest refusal first:** rate limit, then cheap checks, then D1 and signatures.
C7. **Small CPU, cached per isolate:** constants only at module scope, bodies capped, keys cached.
C8. **KV is a cache of D1, never a store** (counters, locks, limits, cursors live elsewhere).
C9. **What many readers see is cached,** not recomputed per request.
C10. **Jobs are bounded, leased and idempotent;** fan-out at scale goes to a Queue.
C11. **Durable Objects only where one place must decide,** one per entity, hibernating.
C12. **R2 by known keys,** no `list()` on a request path.
C13. **Logs and traces are billed by volume:** a line when something happened, invocation logs off.
C14. **Measure before done:** rows read and written, subrequests and CPU, stated in the report.

## Recipes

- **An API endpoint:** read the iOS side first: the carodo-ios ADRs and `docs/specs/` the
  operation cites, `docs/sync.md`, and the app's code for that flow (`Core/Networking`,
  `Core/Outbox`), so retries, concurrency, Keychain and App Attest use match on both sides. Then the
  contract (`carodo-ios/docs/api/carodo-api.yaml`, and `docs/sync.md` if the rules change; owner's
  approval), then a service with its test against D1, then the route.
- **Something the web shows:** a `WebRpcApi` method in `apps/api/src/rpc/types/`, implemented in
  `WebRpc` by calling a service; tested in the api; the web's page renders the result.
- **A binding (R2, Durable Object, Queue):** `wrangler.jsonc`, then `task types`; a Durable Object
  also needs its class exported and a migration tag. Ask first (P6).
- **A dependency:** one entry in the `pnpm-workspace.yaml` catalog, `catalog:` in the package; only
  a release past pnpm's minimum release age. Ask first (P6).
- **A lasting decision:** `docs/decisions/NNNN-<slug>.md` (`docs/decisions/README.md`).

## Gotchas — preflight checklist

- [ ] **Owner editing in parallel?** Stage only your own paths; never `git add -A`, amend, reset
  or rewrite history without approval.
- [ ] **Changed a `wrangler.jsonc`?** `task types`, and redeclare bindings in every environment
  (an environment inherits none).
- [ ] **Web test passes but the page fails?** The web's tests use a stand-in api; the real
  `WebRpc` is tested in the api.
- [ ] **Docs disagree?** Code and the ADRs win; say so in your report.

## Conventions

- **Formatting:** Biome only (2 spaces, 120 columns, double quotes); never add Prettier or ESLint.
- **Tests:** `test/unit/<domain>/<subject>.test.ts` for plain code (Node, instant) and
  `test/workers/<domain>/<subject>.test.ts` for anything with a binding, D1, a route or the Workers runtime
  (workerd, `@cloudflare/vitest-plugin`); a service that touches D1 is tested against D1 built from
  the migrations. Count workerd processes before raising Vitest or the plugin
  (`docs/operations/local.md` "Tests").
- **Commits:** lowercase conventional commits with an optional scope, e.g.
  `feat(shares): revoke a share link`. One logical change per commit; commit only when asked.
- **Done means:** `task check` passes, tests added or updated, the contract and docs updated in
  the same change, exact commands and results reported.
