# Docs

| Read | For |
|---|---|
| [`architecture.md`](architecture.md) | Implementation status and limits, layers, folders, where a new file goes, and patterns from earlier projects |
| [`cost.md`](cost.md) | What Cloudflare bills, the cost rules C1–C14 and how to follow and measure them |
| [`storage.md`](storage.md) | What the backend keeps and where; R2 layout and key rules; how a share page is cached yet revocable |
| [`metrics.md`](metrics.md) | The Analytics Engine datasets, their append-only positions, and how to query them |
| [`decisions/`](decisions/README.md) | The backend's own decisions (product-wide ones are carodo-ios ADRs) |
| [`operations/local.md`](operations/local.md) | Running, testing and resetting the Workers on your machine |
| [`operations/deploy.md`](operations/deploy.md) | Choosing the Cloudflare account, migrating D1 and deploying staging |

What is built today: [implementation status](architecture.md#implementation-status).

The HTTP contract is `carodo-ios/docs/api/carodo-api.yaml` and the sync rules
`carodo-ios/docs/sync.md`, one copy each, read in place; change them before implementing either
side.
