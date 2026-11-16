import { landingCopy, type SiteLanguage, type SiteTranslations } from "../landing-i18n";
import { Layout } from "../layout";

type LegalCopy = Record<string, string> & { title: string; description: string; heading: string; effective: string };

export type LegalDocument = {
  copy: { vi: LegalCopy; en: LegalCopy };
  blocks: {
    kind: "heading" | "paragraph" | "list";
    key: string;
    items?: string[];
    leadKey?: string;
    href?: string;
    labelKey?: string;
  }[];
};

/** Legal documents use the same site chrome, language preference and readable article width. */
export function LegalPage({
  document,
  lang = "en",
  url,
}: {
  document: LegalDocument;
  lang?: SiteLanguage;
  url?: string;
}) {
  const t = document.copy[lang];
  const translations: SiteTranslations = {
    vi: {
      ...landingCopy.vi,
      ...document.copy.vi,
      legalLabel: document.copy.vi.title.includes("Điều khoản") ? "Điều khoản" : "Quyền riêng tư",
      lastUpdated: "Cập nhật lần cuối:",
    },
    en: {
      ...landingCopy.en,
      ...document.copy.en,
      legalLabel: document.copy.en.title.includes("Terms") ? "Terms" : "Privacy",
      lastUpdated: "Last updated:",
    },
  };
  return (
    <Layout
      title={t.title}
      description={t.description}
      url={url}
      lang={lang}
      legal
      languageSwitcher
      translations={translations}
    >
      <main class="mx-auto w-full max-w-4xl px-4 pt-10 pb-20 sm:px-6 sm:pt-16">
        <article class="typeset typeset-carodo min-w-0" aria-label={t.heading} data-i18n-aria="heading">
          <header>
            <p class="text-sm font-medium text-primary" data-i18n="legalLabel">
              {translations[lang].legalLabel}
            </p>
            <h1 class="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl" data-i18n="heading">
              {t.heading}
            </h1>
            <p class="mt-4 text-base leading-relaxed text-muted-foreground" data-i18n="description">
              {t.description}
            </p>
            <p class="mt-5 rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              <em>
                <span data-i18n="lastUpdated">{lang === "vi" ? "Cập nhật lần cuối:" : "Last updated:"}</span>{" "}
                {t.effective.replace(/^(Last updated:|Cập nhật lần cuối:)\s*/i, "")}
              </em>
            </p>
          </header>
          {document.blocks.map((block) => {
            if (block.kind === "heading") return <h2 data-i18n={block.key}>{t[block.key]}</h2>;
            if (block.kind === "list")
              return (
                <ul>
                  {block.items?.map((key) => (
                    <li data-i18n={key}>{t[key]}</li>
                  ))}
                </ul>
              );
            if (block.href && block.labelKey)
              return (
                <p>
                  {block.leadKey && (
                    <>
                      <strong data-i18n={block.leadKey}>{t[block.leadKey]}</strong>{" "}
                    </>
                  )}
                  <span data-i18n={block.key}>{t[block.key]}</span>{" "}
                  <a href={block.href} data-i18n={block.labelKey}>
                    {t[block.labelKey]}
                  </a>
                  .
                </p>
              );
            if (block.leadKey)
              return (
                <p>
                  <strong data-i18n={block.leadKey}>{t[block.leadKey]}</strong>{" "}
                  <span data-i18n={block.key}>{t[block.key]}</span>
                </p>
              );
            return <p data-i18n={block.key}>{t[block.key]}</p>;
          })}
        </article>
      </main>
    </Layout>
  );
}
