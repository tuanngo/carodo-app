# Deploying

Staging and production live on one Cloudflare account — the one that holds the `carodo.app` zone —
under separate Worker, D1, R2, Analytics Engine, rate-limit and custom-domain names (ADR 0004):

| | Staging (`--env staging`) | Production (`--env production`) |
|---|---|---|
| API Worker | `carodo-api-staging` → `https://api-stg.carodo.app` | `carodo-api` → `https://api.carodo.app` |
| Web Worker | `carodo-web-staging` → `https://stg.carodo.app` | `carodo-web` → `https://carodo.app` |
| D1 (`DB`) | `carodo-staging` | `carodo` |
| R2 (`BLOBS`) | `carodo-staging` | `carodo` |
| Analytics Engine | `carodo_events_staging`, `carodo_metrics_staging` | `carodo_events`, `carodo_metrics` |
| Rate limits | `2001`–`2004` | `3001`–`3004` |
| Site videos (public R2, no binding) | `carodo-media` → `https://media.carodo.app` | the same bucket |

Every deployed command goes through `scripts/wrangler.mjs`, never a bare `wrangler`; it reads
`.env.deploy` at the repository root (gitignored) and strips any `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_API_*` or `WRANGLER_PROFILE` inherited from the shell.

## Once per machine

1. Sign Wrangler in to the Cloudflare account:

   ```sh
   pnpm --filter @carodo/api exec wrangler login
   # Or, if this Mac also signs in to other Cloudflare accounts:
   # pnpm --filter @carodo/api exec wrangler auth create carodo
   ```

2. Create `.env.deploy` from `.env.example`:

   ```sh
   cp .env.example .env.deploy
   # CLOUDFLARE_ACCOUNT_ID: the 32-character account id (dashboard URL, or `wrangler whoami`)
   # WRANGLER_PROFILE: leave empty for `wrangler login`, or set `carodo` if created above
   ```

## Once per environment (the owner)

Provision D1 (`--location apac`, near most drivers), R2 and `SECRET_KEY` (use a different random
secret per environment; `--update-config=false` stops Wrangler writing ids back into
`wrangler.jsonc`, which a test refuses):

```sh
# Staging
task wrangler:staging -- api d1 create carodo-staging --location apac --update-config=false
task wrangler:staging -- api r2 bucket create carodo-staging --location apac --update-config=false
openssl rand -base64 32                               # paste it at the next prompt
task wrangler:staging -- api secret put SECRET_KEY    # yes if it offers to create carodo-api-staging

# Production
task wrangler:production -- api d1 create carodo --location apac --update-config=false
task wrangler:production -- api r2 bucket create carodo --location apac --update-config=false
openssl rand -base64 32                                  # a different secret from staging
task wrangler:production -- api secret put SECRET_KEY    # yes if it offers to create carodo-api
```

Once per account, the public bucket of the site's videos (the landing's Replay clip; `apps/web/media/*.mp4`,
too heavy for the Worker). It holds nothing but those files, under keys hashed from their bytes, so
staging and production share it; a reader's request reaches R2 through Cloudflare only, no binding:

```sh
task wrangler:production -- web r2 bucket create carodo-media --location apac --update-config=false
# Dashboard → R2 → carodo-media → Settings → Custom Domains → media.carodo.app (the carodo.app zone).
# Keep the r2.dev URL off: it is rate-limited and uncached. No binding: if Wrangler added one to
# apps/web/wrangler.jsonc, revert it (the web owns no store, ADR 0001).
task media:upload                                     # also run by every deploy, before the web
```

Analytics Engine datasets appear on their first write; rate-limit namespaces need nothing; custom
domains (`api-stg.carodo.app`, `stg.carodo.app`, `api.carodo.app`, `carodo.app`) are attached on the
first deploy because the `carodo.app` zone is on the same account. Before attested iOS builds call a
deployed environment, set the real Team ID in `APP_ID` (`apps/api/wrangler.jsonc`, replacing the
`TEAMID0000` placeholder) and add the WAF rule on `/v1/auth/*` on the `carodo.app` zone.

## Every deploy

```sh
task deploy:staging      # check → migrate carodo-staging → policies → deploy carodo-api-staging → videos → carodo-web-staging
task deploy:production   # check → migrate carodo → policies → deploy carodo-api → videos → carodo-web
```

Each task runs `task check`, applies the D1 migrations to that environment's database, upserts the
username policies (`apps/api/seeds/username-policies.sql`; alone: `task db:policies:<env>`), then deploys
the api, puts the site's videos in `carodo-media` (`task media:upload`, so a page never names a clip
that is not there), then the web (the web's `API` service binding targets the api Worker). Create the database
in the setup step first; if Wrangler asks to create or select another database, stop and verify
`.env.deploy` and the database name.

Only the api, when nothing else changed (no migration, seed, video or web change):
`task check`, then `task wrangler:staging -- api deploy` (or `production`).

**Staging's D1 from scratch (pre-release).** While `0001_baseline.sql` is edited in place, staging
has recorded it as applied and never picks up the edit. `task db:reset:staging -- --yes` drops every
table (`d1_migrations` too), applies the migrations from scratch and upserts the seeds: every
account, session and drive on staging is lost (D1 Time Travel keeps 30 days). Then sign in again
from the app (a claimed account is gone; the app claims a new one). There is no such task for
production: from the first TestFlight build, migrations are additive.

Smoke test and logs:

```sh
curl -sS -X POST https://api-stg.carodo.app/v1/auth/challenge   # or https://api.carodo.app/v1/auth/challenge
curl -sSI https://stg.carodo.app                                # or https://carodo.app
task wrangler:staging -- api tail                               # or task wrangler:production -- api tail
```

A deploy proves the configuration, not the features: what is built is in
[implementation status](../architecture.md#implementation-status).
