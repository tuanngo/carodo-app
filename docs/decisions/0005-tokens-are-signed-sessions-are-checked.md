# ADR 0005: Tokens are signed; an account's session is checked on every request

- Status: Accepted (2026-11-03)
- Context: guest and access tokens are read on every request. A token checked only by its
  signature costs no D1 read but lives until it expires; specs/account.md promises that "Sign out
  everywhere" and account deletion end every session at once.
- Decision:
  - **Signed tokens:** `payload.signature`, HMAC-SHA-256 under a key derived from `SECRET_KEY`
    with one HKDF label per kind (`carodo:guest-token:v1`, `carodo:access-token:v1`), so one kind
    never passes as another and a kind is rotated alone. Guest tokens (~1 h) name the attested
    key and are checked by signature only: they read public data.
  - **Access tokens (~15 min) name the account and its session** (the refresh family, one per
    device). Every request that carries one also reads the family's live row, joined to the
    account (`sessions_on_live_family_id`): a revoked session or a deleted account stops at once.
    A refresh keeps the family, so a request in flight with the earlier access token still passes.
  - **Bound to the device's key:** a request with an assertion must come from the key its session
    was opened with.
  - **Refresh tokens** rotate on every use, one `sessions` row each; a rotated token presented
    again, or shown by another key, revokes the whole family.
  - **Secrets at rest are hashes:** SHA-256 for the account secret and refresh tokens (random,
    256-bit), HMAC for held usernames (guessable, so keyed).
- Reason: one indexed read is far cheaper than the promise it keeps, and it can share a batch
  with the request's own query.
- Consequence:
  - Rotated rows accumulate (one per refresh); a cron prunes revoked rows past their expiry.
  - Rotating `SECRET_KEY` signs everyone out and releases held usernames early: do it only
    for a leak, and say so.
