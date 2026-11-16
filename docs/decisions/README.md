# Decisions

The backend's own lasting choices: one short note per decision that a newcomer, or an agent, would
otherwise be tempted to undo. Product-wide choices (what the backend holds, accounts, encrypted
backups, Cloudflare as the platform) are in the iOS repository's series and are cited as
"carodo-ios ADR 0010"; this series never restates them.

## Rules

- One decision per file, `NNNN-<slug>.md`; the title is the decision as a sentence.
- Context, Decision, Reason, Consequence; 10 to 40 lines.
- `Accepted` records a decision, not implementation or deployment. Keep its original acceptance
  date; use [implementation status](../architecture.md#implementation-status) for current coverage
  and the date it was checked against source.
- Docs and code cite an ADR by number ("ADR 0001"), never by file name.
- Before the first release each ADR states the decision as it stands today and is changed in
  place; from the first TestFlight build a new ADR replaces an old one, whose Status becomes
  `Superseded by NNNN`.

## Index

| ADR | Decision |
|---|---|
| [0001](0001-web-reaches-the-api-only-through-webrpc.md) | The web reaches the api only through `WebRpc`, a service binding with no URL |
| [0002](0002-the-edge-serves-and-caches-it-never-locates-anyone.md) | The edge serves and caches; it never locates anyone (no city or region from the IP) |
| [0003](0003-requests-are-validated-by-hand.md) | Requests are validated by hand, not by a schema library |
| [0004](0004-three-environments-on-one-account.md) | Three environments on one Cloudflare account, separated by resource names and `-stg` custom domains |
| [0005](0005-tokens-are-signed-sessions-are-checked.md) | Tokens are signed; an account's session is checked on every request |
| [0006](0006-the-network-caches-r2-holds-objects-analytics-engine-counts.md) | The network caches; R2 holds objects by id; Analytics Engine counts |
| [0007](0007-event-time-comes-from-the-device-late-is-normal.md) | When it happened comes from the device, when it arrived from the server; late is normal |
| [0008](0008-public-reads-are-cached-by-ttl-bucketed-keys.md) | Public reads are cached by TTL-bucketed keys |
