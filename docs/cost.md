# Cost and performance on Workers

Every request, CPU millisecond, D1 row and storage operation is billed. This page holds the cost
rules (AGENTS.md lists them as C1–C14 and points here), how to follow each one, and how to measure
a change before calling it done. Limits and prices change: read them from Cloudflare's current docs
(`developers.cloudflare.com/<product>/platform/limits/` and `/<product>/platform/pricing/`), never
from memory or from this page.

## What is billed

| Product | Billed by | What makes it grow |
|---|---|---|
| Workers | Requests, and CPU time per request | Work at module scope, crypto, parsing large bodies, logging |
| D1 | Rows **read** and rows **written** (and storage) | A query without an index reads the whole table; every index adds a write per changed row |
| KV | Each read, and each write (writes far dearer) | Writing on every request; using it as a counter |
| R2 | Class A (writes, lists) and Class B (reads) operations, storage | `list()` on a request path; many small writes |
| Durable Objects | Requests, and duration while the object is active | An object kept awake; one global object every request goes through |
| Queues | Operations per message | Fan-out without batching |
| Workers Logs and traces | Volume | A custom event line when something happens; invocation logs and traces are off |

Staging and production share one Cloudflare account with separate stores and datasets (ADR 0004):
a large seed or load test on staging still spends the account's allowance, so keep test runs
bounded.

## D1

### C1. Every query goes through an index

D1 bills the rows a statement **reads**, not the rows it returns. A query that the planner answers
with `SCAN <table>` reads every row, so its cost grows with the table, unnoticed in tests and
visible on the bill.

- Every index in `apps/api/migrations/0001_baseline.sql` names the query it serves beside it. A
  new query either uses one of them or adds one with its name.
- **Pagination is keyset, never `OFFSET`:** `OFFSET 1000` reads and discards 1000 rows.

  ```sql
  -- no: reads every row before the page
  SELECT … FROM drives WHERE hidden_at IS NULL ORDER BY ended_at DESC LIMIT 20 OFFSET 200;
  -- yes: starts at the cursor the last page returned
  SELECT … FROM feed_items WHERE last_ended_at IS NOT NULL AND (last_ended_at, id) < (?, ?) ORDER BY last_ended_at DESC, id DESC LIMIT 21;
  ```
- **No `COUNT(*)` on a request path:** it reads every counted row. Count inside a bounded subquery
  (`SELECT count(*) FROM (SELECT 1 … LIMIT N)`, the day's drives, the month's renames), cache what
  everyone reads (community stats, C9), or answer "more than N" with `LIMIT N + 1`.
- **No leading-wildcard `LIKE '%x'`:** no index can serve it.
- **Select the columns used,** never `SELECT *`: a covering index can then answer without the table.
- A scan that is meant (a tiny fixed table) says so in the SQL: `-- full scan: <why>`.

**How it is enforced:** `apps/api/test/workers/setup.ts` records every statement that code under
`src/` prepares while a `workers` test file runs, explains each one with `EXPLAIN QUERY PLAN` when
the file ends, and fails the file on a full table scan. A route reached through
`exports.default.fetch()` is covered, because the Worker and the tests share the `DB` binding. A
statement no test runs is not checked: every service that touches D1 has a test.

**By hand,** for a query you are writing:

```sh
cd apps/api
pnpm exec wrangler d1 execute DB --local --command "EXPLAIN QUERY PLAN SELECT … WHERE family_id = 'x'"
# SEARCH s USING INDEX sessions_on_live_family_id (family_id=?)   ← good
# SCAN drives                                                       ← reads the whole table
```

### C2. Every foreign key column on the child side has an index

Deleting an account cascades (`ON DELETE CASCADE`) to the rows it owns. SQLite finds them through
an index on the child's column, or by reading the whole child table, once per erased account.

- A new `REFERENCES` column gets an index in the same change (a primary key or an index that starts
  with the column counts). An auxiliary table with no key still gets an index for the `_id` its
  queries use.
- An index costs a write for every row inserted, updated or deleted: add one only for a named
  query, and never two that start with the same columns.

### C3. Writes are facts, not traffic

- Nothing is written per read, per request or per GPS fix (rule 5, carodo-ios ADR 0010).
- No `last_seen_at` touched on every call. A timestamp rides only on a write the request already
  makes: `app_keys.last_used_at` is set in the same statement that must raise the assertion counter.
- Counters (views, opens) go to Analytics Engine and are rolled up into D1 by a job, never
  `UPDATE … SET n = n + 1` per event.

### C4. One round trip

- Statements that belong together are one `db.batch()`: one round trip and one transaction
  (an account's deletion is one batch over every table it touches).
- A write that depends on what was checked carries the check in the same statement or batch: an
  `INSERT … SELECT … WHERE <still true>`, or `WHERE changes() = 1` after the statement it follows
  (linkto's batch guard). A read one round trip earlier is stale by the write, and another request
  can land in between (refresh rotation, login by secret, claiming a held name;
  `test/support/d1-interleave.ts` replays such an interleaving).
- Nothing awaits in a loop (rule 9). Independent work runs together (`Promise.all` / `allSettled`).
- D1 binds at most 100 values per statement: a list of ids travels as one JSON value,
  `WHERE id IN (SELECT value FROM json_each(?))`.

```ts
// no: one round trip per item, and a partial failure leaves half the work done
for (const id of ids) await db.prepare("DELETE FROM x WHERE id = ?").bind(id).run();
// yes: one statement, one round trip
await db.prepare("DELETE FROM x WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).run();
```

### C5. A partial index's column is compared to a literal

A plan prepared for one bound value can be reused for another. A partial index such as
`pending_ops … WHERE kind = 'account.erase'` queried with `kind = ?` may be read for a value it
does not hold, and answer nothing (linkto's ADR 0023). Compare that column to a literal
(`status = 'approved'`), and write two statements for two values. `IS NULL` / `IS NOT NULL` terms
need no care.

## CPU

### C6. Cheapest refusal first

The order of a route's middleware is the order the money is spent:

1. the rate limit (binding, no D1);
2. checks on what is already in hand: body size, header shape, an HMAC token;
3. D1 reads and asymmetric signatures (an App Attest assertion is a D1 read and an ECDSA verify).

Asymmetric crypto runs at most once per request; an X.509 chain is verified only when a key is
attested, never on later requests.

### C7. Small CPU, cached per isolate

- Nothing but constants at module scope: work there runs on every cold start.
- What is derived once is cached per isolate, never per request: HKDF keys and imported
  `CryptoKey`s (`lib/crypto/secret-key.ts`), an `Intl.DateTimeFormat` per time zone.
- A body is capped while it is read (`readBody(c, maxBytes)`): a declared length over the cap is
  refused unread, and the stream is cancelled at the first chunk past it, whatever
  `Content-Length` says. A JSON body is parsed once.
- No regular expression with nested quantifiers (`(a+)+`) on input: it can take exponential time.
- The entry's static imports stay small; a heavy, rarely used path loads with `import()` inside
  the route that needs it.

## Other products

### C8. KV, if ever added, is a cache of D1

Not used today, and why: [`storage.md`](storage.md) "No KV, yet"; adding it needs the owner's
approval (P6). When it is: D1 stays authoritative; a key
is written only when its value changes and read with `cacheTtl`. Never a counter, a lock, a rate
limit or a job cursor: KV is eventually consistent (about a minute to reach every location), takes
about one write a second per key, and a write costs far more than a read. Leases and cursors live
in `job_states`.

### C9. What many readers see is cached, not recomputed

Feed pages, community stats and (later) share pages are the same for many readers: answer them
with an ETag, from the Workers Cache (ADR 0008). A ranking, when one comes, is precomputed by a job
(rule 5); a request never ranks.

### C10. Jobs are bounded and idempotent

- Each run does a fixed amount (`LIMIT`) and leaves the rest for the next run: a backlog drains over
  several runs, never one long one.
- Each job runs under a lease in `job_states` and records itself in `job_runs`
  (`src/jobs/scheduled.ts`); running it twice changes nothing more.
- A cron fires as rarely as the product allows (hourly today). Work that fans out per row at scale
  goes to a Queue, not a loop.

### C11. Durable Objects only where one place must decide

None today: nothing in Feed V1 needs one place to decide. When one comes (a real-time feature,
such as "driving now"): one object per entity, never a global singleton every request
passes through; WebSocket hibernation and alarms, so an idle object is not billed for duration.

### C12. R2 by known keys

Objects live at keys the code can name ([`storage.md`](storage.md): `lib/storage/keys.ts`). No `list()` on a request path;
writes and lists (Class A) cost more than reads, so an object is written once per change.

### C13. Logs and traces are billed by volume

- A log line when something happened (a refusal, a failure, a job's result), nothing per successful
  request on a hot path.
- Invocation logs and traces are off: provider traces can capture request URLs and location/device
  metadata, while a URL path can carry a share token or trip id (P5). Request metrics go to
  Analytics Engine with route patterns instead ([`metrics.md`](metrics.md)).

## C14. Measure before done

A change on a request path states, in its report:

- **D1 rows read and written** per request, from a test: every D1 result carries
  `meta.rows_read` and `meta.rows_written`.

  ```ts
  const { meta } = await env.DB.prepare("SELECT … WHERE id = ?").bind(id).all();
  expect(meta.rows_read).toBeLessThanOrEqual(2);
  ```
- **Subrequests** (D1 calls, `fetch`, service binding calls) per request.
- **CPU:** anything beyond a few signatures and small JSON is measured at realistic size (a full
  page of the feed, the largest body the contract allows).

## Checklist before a change is done

- [ ] Every new query shows `SEARCH … USING INDEX` (the `workers` tests fail otherwise).
- [ ] Every new foreign key column has an index; every new index names its query.
- [ ] Nothing new is written on a read path or per request.
- [ ] No `await` in a loop; statements that belong together are one batch.
- [ ] The route refuses on cheap checks before D1 and signatures.
- [ ] A public, shared read is cached; a job is bounded and leased.
- [ ] No new log line per successful request.
- [ ] The report states rows read/written and subrequests per request.
