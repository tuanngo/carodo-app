# carodo-web

The public website: the landing page, Privacy and Terms today, and later the share page of a trip
someone shared (privacy-trimmed on the device). Keep it a small public site, never a dashboard.

- HTML rendered on the server with Hono JSX (ADR 0001); the only browser script is the language
  switch. Every page shares the site header, footer, palette and the platform's own font.
- No store of its own: everything comes from the api's `WebRpc` through the `API` service binding,
  typed by `@carodo/api/web-contract`. `src/env.ts` declares the bindings by hand; keep it in step
  with `wrangler.jsonc`.
- Tests run in workerd against a stand-in `carodo-api` (`vitest.config.ts`).
- Cost: a page reads and writes **0 D1 rows** and makes **0 subrequests**; its CPU is HTML
  serialization (not measured in production).

## Pages

- **Landing** (`pages/landing.tsx`, `landing-blocks.tsx`): the hero, three features in the order a
  drive lives ("Record it. Keep it. Relive it.": Auto Mode, Journeys, Replay), three promises and
  a short FAQ whose Auto Mode answers are the app's own Help text (`Help.xcstrings`). Carodo is a
  private journal, so no sharing feature is shown. The App Store badge says "Coming soon" and links
  nowhere until a listing exists (iOS `Configuration.appStoreID` is nil).
- **Privacy and Terms** (`pages/legal-page.tsx`, `privacy-content.ts`, `terms-content.ts`): the
  privacy policy states what the iOS app stores and what leaves the iPhone (carodo-ios
  `docs/privacy.md`) and describes only what exists; the Terms sit on top of Apple's standard EULA
  (driving safety, the Feed's community rules, liability). Carodo is run by an individual: the
  pages say "we" and name only `support@carodo.app`. A change to either page changes its
  "Last updated" date.
- **404:** generic, for any missing page; it never assumes a shared link was revoked.

## Language

`src/landing-i18n.ts` holds every Vietnamese and English string, page metadata and accessible
label; feature names follow carodo-ios (`Common`, `Journeys`, `Settings.xcstrings`). The server
picks the language from the `lng` cookie, then `Accept-Language`, else English. The EN/VI switch
changes the page in place (text, titles, `alt` through `data-i18n-alt`) and saves the choice in the
cookie (`carodo.language` in `localStorage` as a fallback); without JavaScript it stays hidden and
the server's choice stands.

Write Vietnamese for the reader's task, not sentence by sentence from English: "chuyến đi" for a
drive, the app's feature names, concrete actions ("xem lại", "ghi chuyến đi", "gửi email"),
technical behaviour in everyday words. Both languages state the same conditions, above all opt-in
sharing and iCloud backup.

## Media

Every image is of the synthetic showcase drives (`-carodo.showcaseJournal`, on an iPhone 18 Pro
Max Simulator), never a real drive; each screen has a Dark twin `<name>-dark.*` (shot with
`-carodo.appearance dark`) chosen by `prefers-color-scheme`.

- **Images** (`media/*.jpg`, 440 px; `media/*.png`, the brand's Open Graph card and icons from the
  handbook's export): `scripts/build-media.mjs` embeds them in `src/.generated/media.ts`; the
  Worker serves them at `/media/<name>.<hash>.<ext>`, immutable for a year. No R2 and no Assets
  binding. `/apple-touch-icon.png` keeps its fixed name; the manifest names the hashed paths.
- **The Replay clip** (`media/replay-clip.mp4` and `-dark.mp4`, 7 s, H.264 720 × 1280, ~535 KB)
  plays muted and looping over the still it starts from. Too heavy for the Worker, it lives in the
  public R2 bucket `carodo-media` at `https://media.carodo.app/<name>.<hash>.mp4`: `build-media.mjs`
  writes those URLs, `task media:upload` (run by every deploy) puts the files. Without the clip, or
  with Reduce Motion, the still stays.

## Styling

Tailwind (with Preflight) and shadcn Typeset, laid out as linkto's public pages; utility classes in
the TSX, no React, no shadcn interactive primitives, no HTMX.

- `styles/tokens.css`: the web palette (owner, 2026-11-15): close to carodo-ios `CarodoSurface`,
  tuned for reading (page `#FAF7F1`, text `#141311`, a Copper accent with more chroma for links,
  labels and focus); brand Charcoal, Copper and Ivory keep iOS's exact values. Light by default,
  Dark and Increase Contrast by media query.
- `styles/public.css`: the Tailwind entry, base styles and the public wash under the sticky header.
- `styles/typeset.css`: vendored shadcn Typeset (MIT, `TYPESET-LICENSE.txt`), from
  https://github.com/shadcn-ui/ui/blob/main/apps/v4/app/(app)/(typeset)/typeset.css, upstream blob
  `5c44d3352362e846f59e60427563fdc241d2c3d7`, formatted by Biome.
- `styles/typography.css`: the Carodo preset: 16 px body, 1.75 leading, ruled headings, accent links.

`pnpm --filter @carodo/web styles` compiles the CSS into `src/.generated/` (gitignored); dev, test,
typecheck and the deploy wrapper build it first. The layout embeds the CSS in each page: no CSS
request, at the cost of repeating it. Never edit generated output.

## Verification

`task check` at the repository root; the web tests check that every displayed key and accessible
label has both translations. Browser QA: 1280 px and 390/320 px, Vietnamese and English, Light and
Dark, the switch and a reload to check it persists, and the page without JavaScript.
