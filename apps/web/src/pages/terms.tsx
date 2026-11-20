import type { SiteLanguage } from "../landing-i18n";
import { LegalPage } from "./legal-page";
import { termsDocument } from "./terms-content";

export function TermsPage({ lang = "en", url, nonce }: { lang?: SiteLanguage; url?: string; nonce?: string }) {
  return <LegalPage document={termsDocument} lang={lang} url={url} nonce={nonce} />;
}
