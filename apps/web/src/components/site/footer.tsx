import { landingCopy, type SiteLanguage } from "../../landing-i18n";

const footerLink = "py-3 text-[0.8125rem] text-muted-foreground transition-colors hover:text-primary";

export function SiteFooter({ lang, languageSwitcher }: { lang: SiteLanguage; languageSwitcher: boolean }) {
  const chrome = landingCopy[lang];
  return (
    <footer class="mt-8 px-4 py-10 text-center sm:px-6">
      <div class="mx-auto flex max-w-5xl flex-col items-center gap-3">
        <div class="flex flex-wrap justify-center gap-x-5">
          <a class={footerLink} href="/privacy" data-i18n={languageSwitcher ? "privacyPolicy" : undefined}>
            {chrome.privacyPolicy}
          </a>
          <a class={footerLink} href="/terms" data-i18n={languageSwitcher ? "termsService" : undefined}>
            {chrome.termsService}
          </a>
          <a class={footerLink} href="mailto:support@carodo.app" data-i18n={languageSwitcher ? "contact" : undefined}>
            {chrome.contact}
          </a>
        </div>
        <p class="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Carodo.{" "}
          <span data-i18n={languageSwitcher ? "rights" : undefined}>{chrome.rights}</span>
        </p>
      </div>
    </footer>
  );
}
