# ADR 0007: When it happened comes from the device, when it arrived from the server; late is normal

- Status: Accepted (2026-11-03); amended 2026-11-19 (quarter-hour times and a 7-day Feed,
  carodo-ios ADR 0007)
- Context: the app records offline and sends through an outbox that retries for hours (carodo-ios
  docs/sync.md); a phone can be without network for days. A drive published on Tuesday may have
  been driven on Sunday, a newer change may overtake an older one in flight, and two devices of one
  person may both send. The device's clock can also be wrong. Instants are UTC at rest (P3).
- Decision:
  - **Two kinds of time, never mixed.** When something happened (`endedAt`, the drive's end
    rounded down to the quarter hour on the device and kept as `ended_at`; `localDate`;
    `partOfDay`) comes from the device and places it in the Feed. No exact time of a drive reaches
    the server (P9). When the server learnt of something is `Date.now()` on the server, exact,
    and serves jobs and audit only (`published_at`, `updated_at`, `unpublished_at`, an item's
    `created_at`): never in a response, never an order and never a reason to show or hide
    anything, since the arrival of a publish is about when the drive ended (owner, 2026-11-19).
    Pruning and the Feed's order use the drive's `ended_at`. Times are not exposed to other
    people: public times go through `services/shared/coarse-time.ts`, with the P9 exceptions for
    own data and protocol times. A day in the driver's zone is computed on the device; the server
    never derives one and never sees a zone.
  - **Device times are checked, not trusted:** `endedAt` is refused (400) off a quarter hour,
    (422) more than 15 minutes ahead of the server or more than two days from its `localDate`
    (the UTC date of `endedAt` minus `localDate` outside −2 to +2 days).
    One older than the Feed's 7 days is answered 204 and not stored.
  - **Revisions order changes, not arrival:** a write carries the trip's revision and is applied
    only when higher than the stored one; a lower or equal one answers success and changes nothing,
    so retries are harmless. An unpublish keeps a tombstone (trip id and revision only) until the
    drive's 7 days have passed, so a late, older publish cannot bring a drive back. Stop sharing
    deletes the account's published drives and keeps no mark; a hidden drive's tombstone stays
    through it until its window passes (the hide is the person's choice).
  - **Late drives count where they belong:** a drive that arrives late, still inside the 7 days,
    lands where it was driven. Leaderboards stay a future decision; drives are kept 7 days only
    and carry no server arrival time, so a board must keep its own totals and change cursor,
    decided when it is built.
  - **The Feed orders by the quarter hour of an item's newest end others can see** (a drive not
    yet released does not move its item, so an item never moves or vanishes for others between
    quarter hours): a late drive appears where it was driven, never at the top.
- Reason: the Feed must say what happened, not when the network allowed it to be said, and must
  never tell anyone when a driver arrived somewhere.
- Consequence:
  - `drives` has `revision`, `ended_at` (on a quarter hour) and the exact audit columns, with
    the index each query needs; the
    contract's `DriveInput` carries `endedAt` and `revision`, `DELETE /v1/feed/drives/{tripId}`
    carries `revision`.
  - The iOS `trips.revision` column is present and is incremented with changes marked for backup.
  - Every later write that the app may send late (shares, badges, profile) follows the same two
    rules: device time for when, rounded as far as others may see it, and a revision for order.
