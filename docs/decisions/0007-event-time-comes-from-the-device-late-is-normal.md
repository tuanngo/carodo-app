# ADR 0007: When it happened comes from the device, when it arrived from the server; late is normal

- Status: Accepted (2026-11-03)
- Context: the app records offline and sends through an outbox that retries for hours (carodo-ios
  docs/sync.md); a phone can be without network for days. A drive published on Tuesday may have
  been driven on Sunday, a newer change may overtake an older one in flight, and two devices of one
  person may both send. The device's clock can also be wrong. Instants are UTC at rest (P3).
- Decision:
  - **Two kinds of time, never mixed.** When something happened (`startedAt`, kept exact as
    `started_at` for the server's logic and as its hour in `drove_at` for the Feed's order;
    `localDate`; `partOfDay`) comes from the device and places it in the Feed and
    on the leaderboards. When the server learnt of it (`published_at`, `updated_at`, `created_at`)
    is `Date.now()` on the server and serves jobs, cursors, pruning and audit only. Exact times of
    either kind are not exposed to other people: public times go through
    `services/shared/coarse-time.ts`, with the P9 exceptions for own data and protocol times. A day in the
    driver's zone is computed on the device; the server never derives one and never sees a zone.
  - **Device times are checked, not trusted:** refused (422) more than 5 minutes ahead of the
    server, more than a year old, or more than a day from their `localDate`. `started_at` keeps the
    exact instant for internal logic; the separate `drove_at` stores its hour for public ordering.
  - **Revisions order changes, not arrival:** a write carries the trip's revision and is applied
    only when higher than the stored one; a lower or equal one answers success and changes nothing,
    so retries are harmless. An unpublish keeps a tombstone with its revision for 30 days, so a late,
    older publish cannot bring a drive back.
  - **Late drives count where they belong:** the future leaderboard job must follow `drives.updated_at` (a
    cursor in `job_states`) and recompute every period a new or changed drive falls in, not only
    the current one. A week's board is sealed 7 days after its last day has ended in every time zone,
    a month's 14 days after; a drive arriving later stays in the Feed and on the profile and leaves
    a sealed board as people saw it.
  - **The Feed orders by `drove_at`:** a late drive appears where it was driven, never at the top.
- Reason: rankings and the Feed must say what happened, not when the network allowed it to be
  said, and a ranking people have seen should not move weeks later.
- Consequence:
  - `drives` has `revision`, `updated_at`, `unpublished_at` and the index each one needs; the
    contract's `DriveInput` and `DELETE /v1/feed/drives/{tripId}` carry `revision`.
  - The iOS `trips.revision` column is present and is incremented with changes marked for backup.
  - Leaderboard period computation/sealing is decided here but is not implemented in this repository.
  - Every later write that the app may send late (shares, badges, profile) follows the same two
    rules: device time for when, server time for arrival, and a revision for order.
