import { landingCopy, type SiteLanguage } from "../../landing-i18n";

/**
 * The App Store badge, not a link until Carodo is on the store ("Coming soon"). `lg` is the hero's,
 * `sm` the header's. Black on Light and Ivory on Dark, as Apple's own badge.
 */
export function AppStoreBadge({ lang, size = "sm" }: { lang: SiteLanguage; size?: "sm" | "lg" }) {
  const t = landingCopy[lang];
  const lg = size === "lg";
  return (
    <span
      class={`inline-flex items-center bg-foreground leading-tight text-background ${
        lg ? "min-h-13 gap-2.5 rounded-xl px-4 py-1.5" : "min-h-8 gap-1.5 rounded-lg px-2 py-0.5"
      }`}
      role="img"
      aria-label={t.appStoreLabel}
      data-i18n-aria="appStoreLabel"
    >
      <svg viewBox="0 0 24 28" width={lg ? 24 : 18} height={lg ? 28 : 21} aria-hidden="true">
        <path
          fill="currentColor"
          d="M17.5 4.5c1.1-1.3 1.9-3.1 1.7-4.5-1.6.1-3.4 1.1-4.5 2.4-1 1.1-1.9 2.9-1.6 4.4 1.7.1 3.3-.9 4.4-2.3ZM23.6 20.5c-.6 1.4-.9 2-1.7 3.3-1.2 1.8-2.8 4-4.8 4-1.8 0-2.3-1.2-4.8-1.2-2.4 0-3 1.2-4.8 1.2-2 0-3.5-2-4.7-3.8C-.5 19-.9 12.7 1.2 9.4c1.5-2.4 4-3.8 6.4-3.8 2 0 3.2 1.2 4.8 1.2 1.5 0 2.5-1.2 4.8-1.2 1.8 0 3.7 1 5.2 2.7-4.6 2.5-3.9 9.1 1.2 12.2Z"
        />
      </svg>
      <span class="grid gap-0.5 text-left">
        <small class={lg ? "text-[0.6875rem]" : "text-[0.5rem]"} data-i18n="appStore">
          {t.appStore}
        </small>
        <strong class={`font-semibold tracking-tight ${lg ? "text-lg" : "text-sm"}`}>App Store</strong>
      </span>
    </span>
  );
}
