# carodo-app

The backend of CARODO, a private drive journal: two Cloudflare Workers that hold only what is
public or shared, plus backups they cannot read (carodo-ios ADR 0010, 0011). This file is the
complete set of rules for this repository; `docs/` holds its decisions and runbooks. Product-wide
decisions are carodo-ios ADRs, cited as "carodo-ios ADR NNNN".

The handbook (`handbook/`, a separate repo next to this one) holds vision, roadmap and plans: read
it for intent, never cite it from code or docs here.

Stack: TypeScript, Hono, Cloudflare Workers (D1, R2, Durable Objects, Queues, Cron), pnpm
workspace, Biome, Vitest in workerd.

## The loop

```sh
task install      # pnpm install (corepack provides the pinned pnpm)
task dev          # api :8080, web :8081, the API binding connects them
task test         # every test, in workerd
task typecheck    # generated binding types current, then tsc for both Workers
task lint         # Biome: format, lint, import boundaries; changes nothing
task format       # Biome: format and fix
task check        # lint + typecheck + test; must pass before a commit
task db:reset     # local D1 from apps/api/migrations
```

From the workspace root they are `task app:<name>`; each wraps a pnpm script. Setup and how the
Workers meet locally: `docs/operations/local.md`.

## Architecture

```
apps/api/    carodo-api: HTTP for the iOS app (src/app.ts, routes), services (rules), WebRpc
             (src/rpc/, the web's only door), migrations/ (D1), test/
apps/web/    carodo-web: share page, Hono JSX on the server, no store; reads only env.API (WebRpc)
packages/    code both Workers run; created when first needed
```

Dependency direction: `route | WebRpc method → service → D1 / R2 / Durable Object`. A service
returns a result and never sees a `Response`; transports authenticate, rate-limit, call it and map
the result (ADR 0001).

## Product invariants — shared with the iOS app

P1. **A trip records without network or account.** The backend is never on the recording path;
    trip ids are the device's UUIDs, never coupled to an account id.
P2. **GPS distance is not the odometer.** Store and show them as different things.
P3. **Units at rest are SI:** meters, meters/second; instants as INTEGER Unix ms in D1, RFC 3339
    UTC strings in JSON. Column names carry the unit (`distance_m`, `duration_s`, `_at`).
P4. **CarPlay disconnect never ends a trip by itself** (an app concern; nothing here infers it).
P5. **Location history is private.** No raw coordinates, tokens or ciphertext in logs or
    analytics; sharing is opt-in and revocable, and a shared route arrives privacy-trimmed. The
    Feed shows how people drive, never where (carodo-ios ADR 0007). Never commit real location
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
   D1 bills rows read: every index serves a named query.
5. **Pull, never poll** (carodo-ios ADR 0010): nothing is written per GPS fix; responses carry
   ETags and are cached; leaderboards are precomputed.
6. **Errors are RFC 9457 problem documents** with a stable `code` (the contract's `Problem`).
7. **Workers hygiene:** structured JSON logs (`console.log(JSON.stringify({...}))`), async work
   awaited or in `ctx.waitUntil`, no module-level request state, `crypto.randomUUID()` /
   `getRandomValues()` for ids and tokens, constant-time comparison for secrets, secrets via
   `.dev.vars` and `wrangler secret put` only.

## Recipes

- **An API endpoint:** the contract first (`carodo-ios/docs/api/carodo-api.yaml`, and
  `docs/sync.md` if the rules change; owner's approval), then a service with its test against D1,
  then the route.
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
- **Tests:** Vitest in workerd (`@cloudflare/vitest-plugin`), `test/<subject>.test.ts`; a service
  that touches D1 is tested against D1 built from the migrations.
- **Commits:** lowercase conventional commits with an optional scope, e.g.
  `feat(shares): revoke a share link`. One logical change per commit; commit only when asked.
- **Done means:** `task check` passes, tests added or updated, the contract and docs updated in
  the same change, exact commands and results reported.
