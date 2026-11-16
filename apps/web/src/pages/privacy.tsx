import type { SiteLanguage } from "../landing-i18n";
import { LegalPage } from "./legal-page";
import { privacyDocument } from "./privacy-content";

export function PrivacyPage({ lang = "en", url }: { lang?: SiteLanguage; url?: string }) {
  return <LegalPage document={privacyDocument} lang={lang} url={url} />;
}
