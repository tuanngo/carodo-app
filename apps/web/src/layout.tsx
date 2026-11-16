import type { Child } from "hono/jsx";
import { raw } from "hono/utils/html";
import { publicStyles } from "./.generated/styles";
import { siteImage } from "./assets";
import { SiteFooter } from "./components/site/footer";
import { SiteHeader } from "./components/site/header";
import { createLanguageScript, landingCopy, type SiteLanguage, type SiteTranslations } from "./landing-i18n";

const ogImage = siteImage("og-image");
const ogLocale: Record<SiteLanguage, string> = { en: "en_US", vi: "vi_VN" };

/**
 * Shared page shell: `<html>`, `<head>`, sticky header, `{children}`, footer.
 * Every page goes through here so the layout, meta, and inline styles are consistent.
 * A page with a `url` (its absolute address, no query) gets a link preview: Open Graph, which
 * Messages, Zalo and Facebook read, and the large X card. The 404 page has none.
 */
export function Layout({
  title,
  description,
  url,
  lang = "en",
  languageSwitcher = false,
  legal = false,
  translations = landingCopy,
  children,
}: {
  title: string;
  description?: string;
  url?: string;
  lang?: SiteLanguage;
  languageSwitcher?: boolean;
  legal?: boolean;
  translations?: SiteTranslations;
  children: Child;
}) {
  return (
    <html lang={lang}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {description && <meta name="description" content={description} />}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#242321" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#FAF7F1" media="(prefers-color-scheme: light)" />
        <title>{title}</title>
        {url && (
          <>
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="Carodo" />
            <meta property="og:url" content={url} />
            <meta property="og:title" content={title} />
            {description && <meta property="og:description" content={description} />}
            <meta property="og:locale" content={ogLocale[lang]} />
            <meta property="og:image" content={new URL(ogImage.path, url).href} />
            <meta property="og:image:type" content={ogImage.type} />
            <meta property="og:image:width" content={String(ogImage.width)} />
            <meta property="og:image:height" content={String(ogImage.height)} />
            <meta property="og:image:alt" content="Carodo" />
            <meta name="twitter:card" content="summary_large_image" />
          </>
        )}
        <style>{raw(publicStyles)}</style>
      </head>
      <body class="relative isolate min-h-svh overflow-x-clip">
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(90vh,56rem)] bg-public-wash"
        />
        <SiteHeader lang={lang} languageSwitcher={languageSwitcher} legal={legal} />

        {children}

        <SiteFooter lang={lang} languageSwitcher={languageSwitcher} />
        {languageSwitcher && <script>{raw(createLanguageScript(translations))}</script>}
      </body>
    </html>
  );
}
