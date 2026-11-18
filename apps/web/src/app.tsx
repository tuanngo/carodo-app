import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { html } from "hono/html";
import { type SiteImage, siteMedia } from "./.generated/media";
import { FAVICON_SVG, SITE_WEBMANIFEST, siteImage } from "./assets";
import type { WebEnv } from "./env";
import { LANGUAGE_COOKIE, notFoundCopy, resolveRequestLanguage, type SiteLanguage } from "./landing-i18n";
import { Layout } from "./layout";
import { LandingPage } from "./pages/landing";
import { PrivacyPage } from "./pages/privacy";
import { TermsPage } from "./pages/terms";

/**
 * Pages render on the server. The landing page progressively enhances its sample Replay in the
 * browser. Pages that need backend data read through the API service binding (docs/decisions/0001).
 */
export const app = new Hono<{ Bindings: WebEnv }>();

function pageLanguage(c: Context<{ Bindings: WebEnv }>): SiteLanguage {
  c.header("Vary", "Accept-Language, Cookie");
  return resolveRequestLanguage({
    cookie: getCookie(c, LANGUAGE_COOKIE),
    acceptLanguage: c.req.header("Accept-Language"),
  });
}

// ---------------------------------------------------------------------------
// Static brand assets: inline, no R2 or Assets binding (P6)
// ---------------------------------------------------------------------------

app.get("/favicon.svg", (c) => {
  c.header("Cache-Control", "public, max-age=86400, immutable");
  return c.body(FAVICON_SVG, 200, { "Content-Type": "image/svg+xml" });
});
app.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 301));
app.get("/site.webmanifest", (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  return c.body(SITE_WEBMANIFEST, 200, {
    "Content-Type": "application/manifest+json",
  });
});

// The site's images (app screens of the showcase drives, brand icons, the Open Graph card), from
// memory: a /media path carries a hash of the bytes, so it is cached for good. Decoded once per
// isolate.
const mediaByPath = new Map(Object.values(siteMedia).map((image) => [image.path, image]));
const decoded = new Map<string, ArrayBuffer>();
function sendImage(c: Context<{ Bindings: WebEnv }>, image: SiteImage, cacheControl: string) {
  let bytes = decoded.get(image.path);
  if (!bytes) {
    bytes = Uint8Array.from(atob(image.base64), (ch) => ch.charCodeAt(0)).buffer;
    decoded.set(image.path, bytes);
  }
  c.header("Cache-Control", cacheControl);
  return c.body(bytes, 200, { "Content-Type": image.type });
}
app.get("/media/:file", (c) => {
  const image = mediaByPath.get(c.req.path);
  if (!image) return c.notFound();
  return sendImage(c, image, "public, max-age=31536000, immutable");
});
// iOS asks for this name at the root even without the <link>, so it keeps a fixed path.
const appleTouchIcon = siteImage("apple-touch-icon");
app.get("/apple-touch-icon.png", (c) => sendImage(c, appleTouchIcon, "public, max-age=86400"));

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** The page's absolute address without its query: the link preview's `og:url` and image host. */
function pageUrl(c: Context<{ Bindings: WebEnv }>): string {
  const { origin, pathname } = new URL(c.req.url);
  return `${origin}${pathname}`;
}

app.get("/", (c) => c.html(html`<!doctype html>${<LandingPage lang={pageLanguage(c)} url={pageUrl(c)} />}`));
app.get("/privacy", (c) => c.html(html`<!doctype html>${<PrivacyPage lang={pageLanguage(c)} url={pageUrl(c)} />}`));
app.get("/terms", (c) => c.html(html`<!doctype html>${<TermsPage lang={pageLanguage(c)} url={pageUrl(c)} />}`));

app.notFound((c) => {
  const lang = pageLanguage(c);
  const t = notFoundCopy[lang];
  return c.html(
    html`<!doctype html>${(
      <Layout title={t.title} lang={lang} noindex>
        <main class="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
          <h1 class="mb-2 text-2xl font-semibold tracking-tight">{t.heading}</h1>
          <p class="text-muted-foreground">{t.body}</p>
        </main>
      </Layout>
    )}`,
    404,
  );
});
