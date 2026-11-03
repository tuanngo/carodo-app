# Decisions

The backend's own lasting choices: one short note per decision that a newcomer, or an agent, would
otherwise be tempted to undo. Product-wide choices (what the backend holds, accounts, encrypted
backups, Cloudflare as the platform) are in the iOS repository's series and are cited as
"carodo-ios ADR 0010"; this series never restates them.

## Rules

- One decision per file, `NNNN-<slug>.md`; the title is the decision as a sentence.
- Context, Decision, Reason, Consequence; 10 to 40 lines.
- Docs and code cite an ADR by number ("ADR 0001"), never by file name.
- Before the first release each ADR states the decision as it stands today and is changed in
  place; from the first TestFlight build a new ADR replaces an old one, whose Status becomes
  `Superseded by NNNN`.

## Index

| ADR | Decision |
|---|---|
| [0001](0001-web-reaches-the-api-only-through-webrpc.md) | The web reaches the api only through `WebRpc`, a service binding with no URL |
