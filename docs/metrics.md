# Metrics

Workers Analytics Engine holds what is counted, so nothing is written to D1 per event or per
request (cost C3) and no invocation log is kept per request (C13). Writing a data point is not
awaited and costs next to no CPU; Cloudflare samples at volume, so a query weights each row by
`_sample_interval`. The writers are in `apps/api/src/lib/observability/analytics.ts`.

Workers traces are disabled in `apps/api/wrangler.jsonc` and `apps/web/wrangler.jsonc`: provider
traces can retain request URLs and location/device metadata. The custom metrics below record route
patterns instead of raw URLs.

**Never in a data point:** an account id, a key id, a token, a username, a coordinate or an address
(P5, ADR 0002). A route is recorded as its pattern (`/v1/shares/:token`), never its URL.

**Positions are append-only:** a blob or double keeps its position and meaning for good; a new
field is added at the end, and a field no longer written stays reserved. A query reads by position,
so moving one would silently mix old and new data.

## `carodo_metrics` (binding `METRICS`): one point per request

| Position | Field | Example |
|---|---|---|
| index1 | route pattern (sampling key) | `/v1/auth/guest` |
| blob1 | route pattern | `/v1/auth/guest`, `(unmatched)` |
| blob2 | method | `POST` |
| blob3 | outcome: the Problem's `code`, or `ok` | `ok`, `username_taken`, `rate_limited` |
| blob4 | Cloudflare colo | `SGN` |
| blob5 | country, as `request.cf` reports it, never stored elsewhere | `VN` |
| double1 | HTTP status | `200` |
| double2 | duration in ms (wall time; CPU is not visible to the Worker) | `38` |

Written by the middleware in `apps/api/src/app.ts` after the answer is decided; a failure to write
never fails a request.

## `carodo_events` (binding `EVENTS`): what happened in the product

| Position | Field | Example |
|---|---|---|
| index1 | event (sampling key) | `account.created` |
| blob1 | event | `key.attested`, `account.created`, `account.renamed`, `account.deleted`, `account.erased`, `sharing.on`, `sharing.off`, `drive.published`, `drive.unpublished`, `reaction.set` |
| blob2 | detail: a category, never an identifier | `development` (App Attest environment), `road` (a reaction) |
| double1 | value: 1 for a count, or a size or a distance | `1`, `42800` (`drive.published`: meters) |

A new event is a new name in `EventName`, added here in the same change.

## Reading them

The Analytics Engine SQL API, with an API token that can read Account Analytics:

```sh
curl "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $TOKEN" \
  -d "SELECT blob3 AS outcome, SUM(_sample_interval) AS requests
      FROM carodo_metrics
      WHERE timestamp > NOW() - INTERVAL '1' DAY AND blob1 = '/v1/accounts'
      GROUP BY outcome ORDER BY requests DESC"
```

Its SQL is a small subset (no joins); counts are always `SUM(_sample_interval)`, never `COUNT()`.
The app never waits on this API: the Feed's community numbers (`GET /v1/feed/stats`) are computed
from D1's `drives` over the window and cached (ADR 0008), not from these events.
