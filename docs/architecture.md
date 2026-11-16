# Architecture

How the two Workers are laid out, where a new file goes, and where the patterns come from. The
rules every change follows are in `AGENTS.md`; what each one costs is in [`cost.md`](cost.md).

## Implementation status

Checked against source on **2026-11-16** (Feed V1, contract 0.28.2-draft). It records code in this
repository, not what is deployed: **Implemented** means the service and transport exist,
**Partial** some of the flow, **Not implemented** only a contract, schema or design.

| Area | Status | Present code and limits |
|---|---|---|
| App Attest, challenges and guest tokens | Implemented | Apple attestation/assertion validation, counters and guest issuance. Debug proofs are allowed only by local/staging policy; production refuses them. |
| Accounts and sessions | Partial | Claim (sharing off unless asked), account-secret login, refresh, deletion and erasure. Username rules in one place: the contract's pattern, reserved words in code, reserved and profane names in `username_policies` (seeded from `apps/api/seeds/`), holds after a deletion or a rename. DeviceCheck enforcement remains a TODO; account export and device/session management are not implemented. |
| Profile and sharing | Implemented | `GET`/`PUT /v1/me/profile` (3 renames in 30 days, the old name held 90 days), `GET /v1/usernames/{username}` (reason and suggestions), `GET`/`PUT /v1/me/sharing` (Stop sharing takes every drive off the Feed). |
| Drive publishing | Implemented | `PUT`/`DELETE /v1/feed/drives/{tripId}`: validation, the geographic refusal, revision ordering, tombstones, Stop sharing's republish at the same revision, at most 50 visible drives a local day. No route or raw GPS upload. |
| Feed | Implemented | One worldwide Feed over 72 hours: an item per person and local day (`feed_items`, random ids), keyset pages on (hour, id) with sealed cursors, the author's choices at read time, a member's own item and reaction laid over the shared page, ETags. Report and block are deferred. |
| Reactions | Implemented | `PUT`/`DELETE /v1/feed/items/{itemId}/reaction`, five fixed reactions, counts only. |
| Community stats | Implemented | `GET /v1/feed/stats` computed from the window's drives, k-anonymous from 10 drivers, cached for everyone. |
| Feed cache | Implemented | TTL-bucketed Workers Cache in production configuration; local/staging bypass storage. This does not establish that production is deployed. |
| Scheduled work | Implemented | Only `account.erase`, `prune.expired` and `prune.job_runs`, with D1 leases and run records. |
| Metrics | Implemented | Request and product-event writers. |
| Shared trips, previews, avatars and encrypted backups | Not implemented | Schema, R2 key helpers and account-erasure support exist, but upload/download/share endpoints do not. |
| Live, Following, regions, leaderboards, badges on the Feed, Sign in with Apple | Removed | Not in Feed V1 (carodo-ios ADR 0007); their code and tables were deleted on 2026-11-15 and come back with their own decision. |
| Web | Partial | Landing, Privacy and Terms in Vietnamese and English, the site's images and icons, the Replay clip from the public `carodo-media` bucket, a generic 404. The `API` binding and `WebRpc.ping()` exist; share lookup and rendering are not implemented. |
| Environments | Partial | Local/staging/production configs and the deployment wrapper exist. Staging/production still have placeholder Team IDs; cloud provisioning, WAF and deployed behavior are not verified by this source review. |

Schema constraints are AGENTS.md rule 4: `account.erase` deletes the account row and the cascade
the rest; a test fails if any table with an `account_id` keeps a row after an erase.

## Layers

```
transports      routes/ (HTTP for the app)   rpc/ (WebRpc for the web)   jobs/ (Cron)
    │                    │
    │              http/ (what HTTP routes share: authentication, problems, rate limits, bodies)
    ▼                    ▼
services/<domain>/       the rules; return a Result, never see a Response (ADR 0001)
    ▼
lib/<area>/              plain helpers with no rule: encoding, crypto, observability, cache, platform, storage, time
    ▼
D1 · R2 · Rate Limiting · Analytics Engine
```

A layer imports only the layers below it. Biome enforces it (`biome.json`, `noRestrictedImports`):
`lib/` imports nothing of ours above it and no Hono; `services/` imports no transport and no Hono;
the web imports only `@carodo/api/web-contract` (ADR 0001).

## apps/api

```
src/
  index.ts              the Worker's exports: fetch, scheduled, WebRpc
  app.ts                the Hono app: request metrics, mounts routes/, maps errors to problems
  routes/<area>.ts      one module per contract area: auth.ts (/v1/auth/*), accounts.ts (/v1/accounts,
                        /v1/account, /v1/me/*, /v1/usernames/*), drives.ts (/v1/feed/drives/*),
                        feed.ts (/v1/feed, /v1/feed/stats, reactions)
  rpc/                  WebRpc and its type-only contract (types/)
  jobs/scheduled.ts     the Cron transport: jobs under a lease, recorded in job_runs
  http/                 auth.ts (guest token, reader, assertion, account), problem.ts, respond.ts (with ETags),
                        rate-limit.ts, request.ts (capped bodies), context.ts (c.var types)
  services/
    shared/             result.ts (Result, ok, fail), input.ts (validation helpers, ADR 0003),
                        coarse-time.ts (every public time: publicHour, agoBucket)
    attest/             App Attest: attestation, assertion, keys in D1, the pinned Apple root
    auth/               challenges, guest tokens, sessions and refresh, signed tokens
    accounts/           claim, usernames (policies, holds, suggestions), profile, sharing, deletion, erasure
    drives/             publishing to the Feed: input, the geographic refusal, time checks, revisions
    feed/               items (one person and local day), pages and sealed cursors, reactions, stats
    jobs/               pruning
  lib/
    encoding/           bytes (base64, hashing), cbor, der (X.509)
    crypto/             secret-key (one root, HKDF per label)
    observability/      log (structured JSON lines), analytics (Analytics Engine data points)
    cache/              edge-cache (TTL-bucketed keys, stale-while-revalidate, one computation per key; ADR 0008)
    platform/           ids (UUIDv7)
    storage/            keys (every R2 object key, docs/storage.md)
    time/               units (durations in ms: SECOND_MS … DAY_MS)
migrations/             0001_baseline.sql (edited in place until the first TestFlight build)
seeds/                  username-policies.sql: idempotent upserts, applied by db:reset, the tests and deploys
scripts/                tools run with Node (app-attest-vectors.ts)
test/
  unit/<domain>/        plain code, in Node (Vitest project `unit`)
  workers/<domain>/     bindings, D1, routes, jobs, the Workers runtime (project `workers`)
  workers/setup.ts      migrations and seeds, and the full-scan check over every statement src/ runs
  support/              encoders, a stand-in Apple CA, a test device (`.ts` imports, so Node runs them)
  fixtures/             data tests read: the App Attest vectors (the iOS tests keep a copy)
```

### Where a new file goes

- **A new rule** goes in the service of its domain: `services/<domain>/<subject>.ts`. A new domain
  (shares, feed, backups) is a new folder, named after the contract area.
- **A new endpoint** goes in `routes/<area>.ts` for its contract area; a new area is a new module
  mounted in `app.ts`. The route authenticates (`http/auth.ts`), rate-limits, validates through the
  service's parser, calls the service and maps the result: nothing else.
- **A helper** goes in `lib/<area>/` only if it holds no rule and imports nothing above `lib/`; a
  helper a second service needs moves there instead of being copied.
- **A test** sits under the same domain as its subject: `test/unit/<domain>/` when the code is plain,
  `test/workers/<domain>/` when it needs a binding, D1, a route or the runtime.
- A folder holds one domain or one kind of thing; a file named after what it does, not `utils.ts`.

## Time

Instants are UTC at rest: `INTEGER` Unix milliseconds in D1 (`_at` columns), RFC 3339 UTC strings
in JSON (P3). Every write the app sends may arrive late, so (ADR 0007):

| Time | Source | Used for |
|---|---|---|
| When it happened: `started_at`, `ended_at` (exact, never exposed), `drove_at` (the start's hour), `local_date`, `local_start_hour`, `part_of_day` | The device, checked (not ahead, not over a year old, within a day of its local date, ending at most 24 h after it starts) | "ago" from the start's hour, "now" also when it ended within the hour (`coarse-time.ts`); the Feed's order by the hour of an item's newest end (`feed_items.sort_hour`), then its random id; the item by `local_date`; the busiest hour by `local_start_hour`. |
| When the server learnt of it: `published_at`, `updated_at`, `created_at` | `Date.now()` on the server | Job cursors, pruning, audit |

- A day in the driver's zone comes from the device; the server never derives one or sees a zone.
- A write carries the trip's `revision` and is applied only when higher; an unpublish keeps a
  tombstone 30 days, so a late older write changes nothing.
- `now` is a parameter of every service, never read inside one, so tests can place a run in time.

## apps/web

```
src/index.tsx           the Worker's export
src/app.tsx             routes: /, /privacy, /terms, /media/:file, icons and manifest, the 404
src/env.ts              the web's bindings, written by hand (ADR 0001)
src/layout.tsx          the document shell: metadata, embedded CSS, the language switch
src/landing-i18n.ts     every Vietnamese and English string of the site
src/pages/              landing, privacy and terms (legal-page.tsx and its *-content.ts)
src/components/site/    header, footer, App Store badge
src/styles/             Tailwind tokens, public styles, vendored shadcn Typeset
src/.generated/         compiled CSS and embedded images (gitignored; scripts/build-*.mjs)
media/                  the site's screenshots, brand PNGs and Replay clips (synthetic drives only)
scripts/                build-styles, build-media, upload-media (the clips to carodo-media), dev
test/                   pages against a stand-in api (vitest.config.ts)
```

## Where the patterns come from

Two earlier Workers projects by the same owner, linkto (a link platform, mature, with an ADR for
each lesson) and its analytics service, shaped this one. What was taken, what was avoided on
purpose, and what is still to come:

### Taken from linkto

| Lesson | Here |
|---|---|
| A service returns a `Result`; a transport holds no rule | ADR 0001, `services/shared/result.ts`, `http/respond.ts` (plus `reason`, the code a client branches on) |
| Folders by layer and domain, never a flat `src/` | This page; enforced by Biome |
| Every service that touches D1 has a test on a D1 built from the migrations | `test/workers/` |
| Bindings fixed in the test config; a credential the suite must not use is declared empty | `vitest.config.ts` |
| Plain tests in Node, binding tests in workerd | Projects `unit` and `workers` |
| Count workerd processes before raising Vitest or the plugin (a workerd per file leaked under Vitest 5 with plugin 1.4.8) | `operations/local.md` "Tests" |
| `pending_ops` for work owed, job cursors and leases in D1 | Schema; `account.erase`; `job_states` |
| Every environment redeclares every binding; `-local` and `-staging` names; banded rate-limit namespaces | ADR 0004 |
| One Cloudflare account for staging and production (unlike linkto's two) | No `DEPLOY_*` ids, generated config or prepare script: D1 found by name, `-stg` custom domains on `carodo.app`, the account from `.env.deploy` through `scripts/wrangler.mjs` (ADR 0004) |
| One root secret, a key per use by HKDF label, HMAC tokens `payload.signature` | `lib/crypto/secret-key.ts`, ADR 0005 |
| Never `await` in a loop; at most 100 bound values; lists through `json_each` | AGENTS.md rule 9, cost C4 |
| A partial index's column is compared to a literal | Cost C5 |
| Measure request-path work before it is done | Cost C14 |
| Rate limits through the binding, a namespace per environment | `RL_AUTH`, `RL_CLAIM`, `RL_WRITE`, `RL_READ` |
| Structured logs that never carry a token or an address | `lib/observability/log.ts`, invocation logs off |

One step further than linkto: every statement `src/` runs in the tests is explained, and a full
table scan fails `task check` (`test/workers/setup.ts`). It found the account cascade reading four
whole tables on its first run.

### Avoided, as the analytics service showed their cost

- A `lib/` of everything, and routes that write their own queries: no service layer to test or reuse.
- Zod (ADR 0003, CPU per request) and an ORM built on every request: SQL through `D1.prepare`.
- Prettier, ESLint and Turbo side by side: Biome alone, and a Taskfile.

### To bring in when its feature arrives

- **Pre-warming** the most viewed public reads (a Cron touching the Feed's first page), once the
  metrics show cold misses (ADR 0008; the cache itself is in place).
- **Changed-files checks** (linkto's `check:changed`: lint, guards and tests by path) once the suite
  passes about 50 files or `task check` takes more than half a minute.
- **Deployment checks:** config tests already compare staging/production binding names and enforce
  the production debug-proof policy. Verifying provisioned resources and WAF rules against the
  intended account still belongs to deployment; source tests cannot establish that state.
- **Benchmarks at realistic size** for the other hot reads, asserting rows read, as
  `test/workers/feed/cost.test.ts` does for the Feed.
