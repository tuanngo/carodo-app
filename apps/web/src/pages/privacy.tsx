import type { SiteLanguage } from "../landing-i18n";
import { LegalPage } from "./legal-page";
import { privacyDocument } from "./privacy-content";

export function PrivacyPage({ lang = "en", url, nonce }: { lang?: SiteLanguage; url?: string; nonce?: string }) {
  return <LegalPage document={privacyDocument} lang={lang} url={url} nonce={nonce} />;
}
