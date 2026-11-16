# ADR 0004: Three environments on one Cloudflare account, separated by resource names and `-stg` custom domains

- Status: Accepted (2026-11-03, changed 2026-11-12 before the first deploy)
- Context: the api and the web need a place to rehearse a deploy, a migration, a WAF rule and an App
  Attest flow before production sees it. Maintaining two Cloudflare accounts means two logins, two
  payment setups for R2, and no `carodo.app` zone on staging for custom domains or WAF rules; on one
  account, resources and Analytics Engine datasets (which have no delete) must never collide.
- Decision:
  - **Local** is the top level of each `wrangler.jsonc`, named `carodo-api-local` and
    `carodo-web-local`, so a deploy that forgets `--env` cannot replace a real Worker. Per-machine
    values (`APP_ID` with this Mac's Team ID, `SECRET_KEY`) live in `.dev.vars`.
  - **Staging and production share one Cloudflare account and the `carodo.app` zone,** separated by
    explicit names in `wrangler.jsonc` (`workers_dev: false` and `preview_urls: false` everywhere):
    - **Staging:** `carodo-api-staging` on `api-stg.carodo.app`, `carodo-web-staging` on
      `stg.carodo.app`, D1 `carodo-staging`, R2 `carodo-staging`, datasets `carodo_events_staging`
      and `carodo_metrics_staging`, rate-limit namespaces `2001`–`2004`. Accepts App Attest's
      `development` and `production` environments and `APP_ATTEST_DEBUG` until the paid Apple
      Developer Program gives a build App Attest.
    - **Production:** `carodo-api` on `api.carodo.app`, `carodo-web` on `carodo.app`, D1 `carodo`,
      R2 `carodo`, datasets `carodo_events` and `carodo_metrics`, rate-limit namespaces
      `3001`–`3004`. Accepts only App Attest's `production` environment and never the debug proof,
      whatever its var says (`services/attest/policy.ts`).
  - **No account and no resource id in the config.** Wrangler finds D1 by `database_name`. The
    account id (and optional Wrangler auth profile) comes from `.env.deploy` at the repository root
    (gitignored) through `scripts/wrangler.mjs <env> <app> …`, which strips any account id, token or
    profile inherited from the shell. A test fails on an `account_id`, a deployed `database_id`, or
    any shared Worker, store, dataset or rate-limit namespace name.
  - **An environment inherits nothing:** each one redeclares every binding, var, trigger and
    required secret. Every deployed command names `staging` or `production`; there is no bare deploy.
- Reason: one account, one zone and one login give both environments real `carodo.app` custom
  domains and WAF coverage, while distinct resource names keep their data, metrics and limits apart.
- Consequence:
  - The account owner, not an agent, creates billable resources (`carodo-staging` and `carodo` D1
    with `--location apac` and R2) and sets each Worker's `SECRET_KEY`.
  - Because staging and production share the account's allowance, test runs on staging stay bounded
    (no large seeds or load tests against deployed D1).
  - Generated types read only the config (`secrets.required`, `--strict-vars=false`), so they are
    the same on every machine. Runbook: `docs/operations/deploy.md`.
