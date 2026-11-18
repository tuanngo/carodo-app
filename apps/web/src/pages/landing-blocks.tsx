import { siteMedia, siteVideos } from "../.generated/media";
import { AppStoreBadge } from "../components/site/app-store-badge";
import { landingCopy, type SiteLanguage } from "../landing-i18n";

type Alt = "autoAlt" | "journalAlt" | "replayAlt";

/** Hero screens in loop order: recording live, the Journeys page, a Replay frame. Showcase drives
 * only (never a real drive); each has a Dark twin (`<key>-dark`). A `clip` plays muted over the
 * still from R2 (`siteVideos`) until the first frame, and the still stays on load failure or
 * Reduce Motion. */
const HERO: { key: string; alt: Alt; tilt: string; clip?: string }[] = [
  { key: "live", alt: "autoAlt", tilt: "-rotate-6 translate-y-10" },
  { key: "journeys-detail", alt: "journalAlt", tilt: "z-10 hero-float" },
  { key: "replay-video-1", alt: "replayAlt", tilt: "rotate-6 translate-y-10", clip: "replay-clip" },
];

/** One screen in an iPhone's outline (Charcoal, as the device). */
function Phone({
  shot,
  lang,
  class: cls = "",
}: {
  shot: { key: string; alt: Alt; clip?: string };
  lang: SiteLanguage;
  class?: string;
}) {
  const image = siteMedia[shot.key];
  const dark = siteMedia[`${shot.key}-dark`];
  const clip = shot.clip ? siteVideos[shot.clip] : undefined;
  const clipDark = shot.clip ? siteVideos[`${shot.clip}-dark`] : undefined;
  const t = landingCopy[lang];
  return (
    <div class={`relative rounded-[2.3rem] bg-charcoal p-[6px] shadow-soft ${cls}`}>
      <picture>
        {dark && <source media="(prefers-color-scheme: dark)" srcset={dark.path} />}
        <img
          src={image?.path}
          width={image?.width}
          height={image?.height}
          alt={t[shot.alt]}
          data-i18n-alt={shot.alt}
          decoding="async"
          class="block h-auto w-full rounded-[1.9rem]"
        />
      </picture>
      {clip && (
        // Decoration: the still beside it carries the alt. No poster: until its first frame the video
        // is transparent and the still shows through.
        <div aria-hidden="true" class="absolute inset-[6px] motion-reduce:hidden">
          <video
            autoplay
            muted
            loop
            playsinline
            preload="auto"
            width={clip.width}
            height={clip.height}
            class="block h-full w-full rounded-[1.9rem] object-cover"
          >
            {clipDark && <source media="(prefers-color-scheme: dark)" src={clipDark.url} type="video/mp4" />}
            <source src={clip.url} type="video/mp4" />
          </video>
        </div>
      )}
    </div>
  );
}

export function LandingScreens({ lang }: { lang: SiteLanguage }) {
  return (
    <div class="mt-14 flex w-full max-w-3xl items-start justify-center sm:mt-16">
      {HERO.map((shot, n) => (
        <Phone
          shot={shot}
          lang={lang}
          class={`landing-rise w-[34%] max-w-[230px] ${n === 1 ? "" : "-mx-3 sm:-mx-4"} ${shot.tilt}`}
        />
      ))}
    </div>
  );
}

/** A small line icon, drawn in the accent. */
function Icon({ name }: { name: "iphone" | "offline" }) {
  const paths: Record<typeof name, string> = {
    iphone:
      "M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5ZM11 18.5h2",
    offline: "M3 3l18 18M8.5 12.5a5 5 0 0 1 4-1.4M5 9a10 10 0 0 1 4-2.4M15 9.7a10 10 0 0 1 4 2.3M12 17.5h.01",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

/** The product loop as three beats: Auto Mode (car-first) → Keep → Relive; not a feature-card grid. */
const BEATS = [
  { label: "autoLabel", title: "autoTitle", body: "autoBody" },
  { label: "journalLabel", title: "journalTitle", body: "journalBody" },
  { label: "replayLabel", title: "replayTitle", body: "replayBody" },
] as const;

export function LandingLoop({ lang }: { lang: SiteLanguage }) {
  const t = landingCopy[lang];
  return (
    <section class="bg-muted/45 py-16 sm:py-24" aria-labelledby="loop-title">
      <div class="mx-auto max-w-3xl px-4 sm:px-6">
        <h2
          id="loop-title"
          class="max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl"
          data-i18n="loopHeading"
        >
          {t.loopHeading}
        </h2>
        <ol class="mt-10 divide-y divide-border">
          {BEATS.map(({ label, title, body }, index) => (
            <li class="landing-rise grid gap-3 py-8 first:pt-0 last:pb-0 sm:grid-cols-[auto_1fr] sm:gap-10">
              <p class="whitespace-nowrap text-sm font-semibold text-primary">
                <span class="mr-2 tabular-nums text-muted-foreground" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span data-i18n={label}>{t[label]}</span>
              </p>
              <div>
                <h3 class="text-xl font-semibold tracking-tight text-balance sm:text-2xl" data-i18n={title}>
                  {t[title]}
                </h3>
                <p class="mt-2 text-pretty leading-relaxed text-muted-foreground" data-i18n={body}>
                  {t[body]}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Privacy band: the promise and policy link, plus two reasons (on-device, no account). */
export function LandingPrivacy({ lang }: { lang: SiteLanguage }) {
  const t = landingCopy[lang];
  const points = [
    ["iphone", "localTitle", "localBody"],
    ["offline", "offlineTitle", "offlineBody"],
  ] as const;
  return (
    <section
      class="bg-charcoal py-16 text-ivory sm:py-24 dark:bg-card dark:text-foreground"
      aria-labelledby="privacy-title"
    >
      <div class="mx-auto grid max-w-5xl gap-10 px-4 sm:px-6 md:grid-cols-[5fr_7fr] md:gap-16">
        <div>
          <h2
            id="privacy-title"
            class="text-3xl font-bold tracking-tight text-balance sm:text-4xl"
            data-i18n="privacyHeading"
          >
            {t.privacyHeading}
          </h2>
          <p class="mt-4 text-lg text-pretty text-ivory/70 dark:text-muted-foreground" data-i18n="privacyLead">
            {t.privacyLead}
          </p>
          <a
            class="mt-6 inline-flex items-center gap-1.5 font-medium text-copper hover:underline underline-offset-4"
            href="/privacy"
          >
            <span data-i18n="privacyPolicy">{t.privacyPolicy}</span> <span aria-hidden="true">→</span>
          </a>
        </div>
        <ul class="divide-y divide-ivory/12 dark:divide-border">
          {points.map(([icon, title, body]) => (
            <li class="landing-rise flex gap-4 py-5 first:pt-0 last:pb-0">
              <span class="grid size-10 shrink-0 place-items-center rounded-full bg-ivory/8 text-copper dark:bg-muted">
                <Icon name={icon} />
              </span>
              <div>
                <h3 class="font-semibold" data-i18n={title}>
                  {t[title]}
                </h3>
                <p class="mt-1 text-pretty text-ivory/70 dark:text-muted-foreground" data-i18n={body}>
                  {t[body]}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function LandingFaq({ lang }: { lang: SiteLanguage }) {
  const t = landingCopy[lang];
  const questions = [
    ["faqOffline", "faqOfflineAnswer"],
    ["faqAutoOff", "faqAutoOffAnswer"],
    ["faqBattery", "faqBatteryAnswer"],
    ["faqAccount", "faqAccountAnswer"],
  ] as const;
  const summary =
    "flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden";
  const plus = (
    <span
      aria-hidden="true"
      class="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45"
    >
      +
    </span>
  );
  return (
    <section class="border-t border-border/60" aria-labelledby="faq-title">
      <div class="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 id="faq-title" class="text-2xl font-bold tracking-tight sm:text-3xl" data-i18n="faqHeading">
          {t.faqHeading}
        </h2>
        <div class="mt-6 divide-y divide-border border-y border-border">
          {questions.map(([question, answer]) => (
            <details class="group">
              <summary class={summary}>
                <span data-i18n={question}>{t[question]}</span>
                {plus}
              </summary>
              <p class="pb-4 text-muted-foreground" data-i18n={answer}>
                {t[answer]}
              </p>
            </details>
          ))}
          <details class="group">
            <summary class={summary}>
              <span data-i18n="faqPrivacy">{t.faqPrivacy}</span>
              {plus}
            </summary>
            <p class="pb-4 text-muted-foreground">
              <span data-i18n="faqPrivacyAnswer">{t.faqPrivacyAnswer}</span>{" "}
              <a
                class="font-medium text-primary underline underline-offset-4"
                href="/privacy"
                data-i18n="privacyPolicy"
              >
                {t.privacyPolicy}
              </a>
              .
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}

/** Closing invite: the same honest “coming soon” as the hero. */
export function LandingCta({ lang }: { lang: SiteLanguage }) {
  const t = landingCopy[lang];
  return (
    <section class="border-t border-border/60" aria-labelledby="cta-title">
      <div class="mx-auto flex max-w-3xl flex-col items-center px-4 py-14 text-center sm:px-6 sm:py-20">
        <h2
          id="cta-title"
          class="max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl"
          data-i18n="ctaHeading"
        >
          {t.ctaHeading}
        </h2>
        <p class="mt-4 text-lg text-pretty text-muted-foreground" data-i18n="ctaBody">
          {t.ctaBody}
        </p>
        <div class="mt-8">
          <AppStoreBadge lang={lang} size="lg" />
        </div>
      </div>
    </section>
  );
}
