import { CarodoLockup } from "../../brand";
import { landingCopy, type SiteLanguage } from "../../landing-i18n";
import { AppStoreBadge } from "./app-store-badge";

/** Quiet control shared by the language switch and the way home. */
const quietControl =
  "relative inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-foreground transition-colors hover:bg-muted before:absolute before:-inset-x-0.5 before:-inset-y-1.5";

export function SiteHeader({
  lang,
  languageSwitcher,
  legal = false,
}: {
  lang: SiteLanguage;
  languageSwitcher: boolean;
  legal?: boolean;
}) {
  const chrome = landingCopy[lang];
  return (
    <header class="sticky top-0 z-30 bg-background/95 backdrop-blur-sm">
      <div class={`mx-auto flex h-17 items-center justify-between px-4 sm:px-6 ${legal ? "max-w-4xl" : "max-w-5xl"}`}>
        <a
          href="/"
          class="inline-flex min-h-11 items-center text-foreground transition-opacity hover:opacity-70 [&_svg]:h-8 sm:[&_svg]:h-9 [&_svg]:w-auto"
          aria-label={chrome.home}
          data-i18n-aria={languageSwitcher ? "home" : undefined}
        >
          <CarodoLockup height={28} />
        </a>
        <div class="flex items-center gap-2 sm:gap-3">
          {languageSwitcher && (
            <button
              id="landing-language"
              type="button"
              class="relative inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border/60 bg-background/50 px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted before:absolute before:-inset-x-0.5 before:-inset-y-2.5"
              aria-label={chrome.languageAction}
              title={chrome.languageAction}
              hidden
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                class="text-muted-foreground"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" />
              </svg>
              <span id="landing-language-label">{lang.toUpperCase()}</span>
            </button>
          )}
          {legal ? (
            <a class={`${quietControl} text-sm font-medium hover:text-primary`} href="/" aria-label={chrome.home}>
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M5 12l6 6M5 12l6-6" />
              </svg>
              <span class="hidden sm:inline" data-i18n="backHome">
                {chrome.backHome}
              </span>
            </a>
          ) : languageSwitcher ? (
            <AppStoreBadge lang={lang} />
          ) : (
            <>
              <a class="py-3 text-[0.8125rem] font-medium text-muted-foreground hover:text-primary" href="/privacy">
                {chrome.privacy}
              </a>
              <a class="py-3 text-[0.8125rem] font-medium text-muted-foreground hover:text-primary" href="/terms">
                {chrome.terms}
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
