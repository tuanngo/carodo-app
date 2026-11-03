# ADR 0001: The web reaches the api only through `WebRpc`, a service binding with no URL

- Status: Accepted (2026-11-03)
- Context: two Workers (carodo-ios ADR 0010). `carodo-api` serves the iOS app and owns every
  store; `carodo-web` renders the public share page. A share page shows a privacy-trimmed trip
  that its owner can revoke at any moment, so "what may be shown" is a rule with exactly one home.
- Decision:
  - **No store in the web.** `carodo-web` has no D1, R2, KV or Durable Object binding. All it
    shows comes from `WebRpc`, an entrypoint the api exports, reached through the `API` service
    binding. It never calls the api's public URL.
  - **Services hold the rules, transports are thin.** An api service returns a result; the HTTP
    routes for the app and the `WebRpc` methods for the web both call it. No rule lives in a
    route, an RPC method or a page.
  - **The contract belongs to the api.** `apps/api/src/rpc/types/` holds the `WebRpcApi`
    interface and the shapes it returns, types only, exported as `@carodo/api/web-contract`.
    `WebRpc` implements it. The web imports nothing else from the api (a Biome rule fails on it)
    and never reads the api's source, so the web's `Env` is written by hand in `src/env.ts`.
  - **The web answers without client script.** Pages are HTML rendered by Hono JSX on the server.
    This is today's choice and may change when the share page is built.
- Reason: a revoked share, a deleted account or a blocked user disappears from the web the moment
  the api says so, because nothing else can answer. A service binding stays inside Cloudflare,
  costs no network hop and cannot be reached from the internet.
- Consequence:
  - A new web need is a new `WebRpc` method calling a service, never a new binding on the web.
  - The contract moves to `packages/` only when a second Worker calls the api, or when both sides
    must run the same validation code; until then one owner keeps it next to its implementation.
  - The web's tests stand in a fake `carodo-api`; what `WebRpc` answers is tested in the api.
