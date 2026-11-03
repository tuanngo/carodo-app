# carodo-web

The lightweight public trip share page and its preview. Shared trip pages show only what the
person explicitly shared, privacy-trimmed on the device. Keep it separate from any future admin
dashboard.

- HTML rendered on the server with Hono JSX, no client script (ADR 0001; may change when the share
  page is built).
- No store of its own: everything comes from the api's `WebRpc` through the `API` service binding,
  typed by `@carodo/api/web-contract`. `src/env.ts` declares the bindings by hand; keep it in step
  with `wrangler.jsonc`.
- Tests run in workerd against a stand-in `carodo-api` (`vitest.config.ts`).
