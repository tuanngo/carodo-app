# CARODO App

This repository area will contain two independently runnable applications:

- `backend/` — Spring Boot REST API: accounts, Feed publishing and share links. Built in parallel with the iOS app.
- `web/` — lightweight public trip share page and Open Graph preview.
- `docker/` — local development infrastructure only when needed.
- `Taskfile.yml` — shortcuts (`task --list`), added with the code they run; from the workspace root `task app:<name>`.

The iOS app stays local-first (carodo-ios ADR 0003): backup and sync go to the person's iCloud (ADR 0008); the backend holds only what is public or shared and is never a dependency of trip recording. The contract is `../carodo-ios/docs/api/carodo-api.yaml` and the sync model `../carodo-ios/docs/sync.md` until this repo keeps its own copy in `docs/api/`; change them before implementing clients and servers.
