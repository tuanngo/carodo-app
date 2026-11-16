# ADR 0003: Requests are validated by hand, not by a schema library

- Status: Accepted (2026-11-03)
- Context: every request body the app sends is small and flat (a username, a few numbers, an
  attestation as base64). A schema library (Zod and its kind) is the usual answer, but it is a
  dependency in the bundle every cold start parses, and it spends CPU building and walking schema
  objects on each request; a Worker is billed and limited by CPU time.
- Decision:
  - **Hand-written validators**, one per request body, next to the service that owns the rule
    (`apps/api/src/services/<module>/`). A validator takes `unknown`, returns a `Result` with the
    typed input or `fail("validation", detail)`, and names the field it refused.
  - **Small shared helpers** for what repeats (a string with a length range, a UUID, an RFC 3339
    instant, a base64url blob with a size cap), in plain TypeScript with no dependency.
  - **The contract stays the source of truth** (`carodo-ios/docs/api/carodo-api.yaml`): a field
    added there is added to its validator and its test in the same change.
- Reason: the payloads are simple enough that a schema language buys little, and the API's CPU
  budget goes to the work that needs it (App Attest verification, signing tokens).
- Consequence:
  - No Zod, Valibot or similar without a new decision.
  - Every validator has tests for its refusals, since no library vouches for it.
