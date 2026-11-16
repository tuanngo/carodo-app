import { siteMedia, siteVideos } from "../.generated/media";
import { landingCopy, type SiteLanguage } from "../landing-i18n";

type Alt = "autoAlt" | "journalAlt" | "replayAlt";

/** The app's own screens under the hero, three iPhones fanned as Geofency's, in the heading's order:
 * a drive recording live, its page in Journeys, a frame of the video Replay exports. Screens of the
 * synthetic showcase drives on an iPhone 18 Pro Max (never a real drive). Each has a Dark twin,
 * `<key>-dark`, shot with the app in Dark (`-carodo.appearance dark`), shown when the reader's
 * system is in Dark. A screen with a `clip` plays it over the still, muted and looping, from R2
 * (`siteVideos`): the still shows until the clip's first frame, and stays when the clip cannot load or
 * the reader asks for Reduce Motion. */
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
function Icon({ name }: { name: "auto" | "journeys" | "replay" | "iphone" | "offline" | "feed" }) {
  const paths: Record<typeof name, string> = {
    auto: "M12 3a9 9 0 1 0 9 9M12 3v4M21 12h-4M9.5 15.5 12 9l2.5 6.5M10.3 13.5h3.4M19 3v4h-4",
    journeys: "M6 19a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM18 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM8 17c6 0 2-9 8-9",
    replay: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM10 8.5v7l6-3.5-6-3.5Z",
    iphone:
      "M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5ZM11 18.5h2",
    offline: "M3 3l18 18M8.5 12.5a5 5 0 0 1 4-1.4M5 9a10 10 0 0 1 4-2.4M15 9.7a10 10 0 0 1 4 2.3M12 17.5h.01",
    feed: "M4 18c3-1 3-6 6-7s4 4 7 2 2-6 3-7M4 18h.01M20 6h.01",
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

/** A strip of the app's own interface, drawn small on top of a feature card (linkto's feature
 * mockups): names and numbers only, the same in both languages. */
function Mock({ name }: { name: "auto" | "journeys" | "replay" }) {
  const strip = "flex h-20 items-center gap-3 rounded-xl bg-muted/70 px-4 text-xs";
  const pill =
    "inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 font-semibold text-foreground shadow-soft";
  if (name === "auto")
    return (
      <div class={strip} aria-hidden="true">
        <span class={pill}>
          {/* Auto Mode: an A in a turning arrow, drawn after the app's symbol (not Apple's glyph). */}
          <svg viewBox="0 0 20 20" width="15" height="15" class="text-primary" aria-hidden="true">
            <g class="mock-spin" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M16.5 10a6.5 6.5 0 1 1-2.2-4.9" />
              <path d="M14.6 2.6v2.8h-2.8" stroke-linejoin="round" />
            </g>
            <path
              d="M7.4 13.2 10 6.8l2.6 6.4M8.4 11h3.2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Auto Mode
          <span class="size-1.5 animate-pulse rounded-full bg-copper" />
        </span>
        <span class={`${pill} ml-auto`}>
          {/* The car, as the app's car.side: the CarPlay connection, without Apple's CarPlay mark. */}
          <svg
            viewBox="0 0 24 16"
            width="18"
            height="12"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M2.5 11.5V9.2c0-.8.5-1.4 1.2-1.6l3.1-.9 2.6-2.8c.4-.4.9-.6 1.4-.6h4.1c.6 0 1.1.3 1.5.7l2.3 2.7 2.3.5c.8.2 1.3.9 1.3 1.6v2.5" />
            <path d="M5 11.5h-2.5M21.5 11.5H19M10 11.5h4.5" />
            <circle cx="7.5" cy="11.8" r="2" />
            <circle cx="16.8" cy="11.8" r="2" />
          </svg>
          CarPlay
        </span>
      </div>
    );
  if (name === "journeys")
    return (
      <div class={strip} aria-hidden="true">
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold text-foreground">P. Hải Vân → Lăng Cô</p>
          <p class="mt-0.5 text-muted-foreground">22,8 km · 38 min</p>
        </div>
        <svg viewBox="0 0 64 28" width="64" height="28" aria-hidden="true" class="shrink-0">
          <path
            d="M3 24c8-2 6-12 14-13s8 9 16 6 6-13 14-12 8 4 14 1"
            fill="none"
            class="stroke-copper"
            stroke-width="2.4"
            stroke-linecap="round"
          />
          <circle cx="3" cy="24" r="2.6" class="fill-card stroke-foreground" stroke-width="1.4" />
          <circle cx="61" cy="6" r="2.6" class="fill-foreground" />
        </svg>
      </div>
    );
  const bars = [6, 9, 12, 10, 14, 17, 15, 19, 18, 13, 16, 20, 17, 12, 9, 13, 16, 11];
  return (
    <div class={strip} aria-hidden="true">
      <span class="grid size-9 shrink-0 place-items-center rounded-full bg-copper text-charcoal">
        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
          <path d="M3 1.8v8.4L10 6Z" fill="currentColor" />
        </svg>
      </span>
      <span class="relative h-6 flex-1">
        <span class="absolute inset-0 flex items-end gap-[3px]">
          {bars.map((h) => (
            <span class="w-1 rounded-sm bg-copper/30" style={`height:${h + 4}px`} />
          ))}
        </span>
        {/* The played part, swept left to right as if playing. */}
        <span class="mock-play absolute inset-0 flex items-end gap-[3px]">
          {bars.map((h) => (
            <span class="w-1 rounded-sm bg-copper" style={`height:${h + 4}px`} />
          ))}
        </span>
      </span>
      <span class="shrink-0 font-semibold text-foreground tabular-nums">44 km/h</span>
    </div>
  );
}

/** What Carodo does, in the order a drive lives: recorded, kept, relived (a private journal: no
 * sharing here). The screens themselves are under the hero; each card carries a strip of its UI. */
const FEATURES = [
  { mock: "auto", label: "autoLabel", title: "autoTitle", body: "autoBody" },
  { mock: "journeys", label: "journalLabel", title: "journalTitle", body: "journalBody" },
  { mock: "replay", label: "replayLabel", title: "replayTitle", body: "replayBody" },
] as const;

export function LandingFeatures({ lang }: { lang: SiteLanguage }) {
  const t = landingCopy[lang];
  return (
    <section class="bg-muted/45 py-16 sm:py-24" aria-labelledby="features-title">
      <div class="mx-auto max-w-5xl px-4 sm:px-6">
        <h2
          id="features-title"
          class="max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl"
          data-i18n="featuresHeading"
        >
          {t.featuresHeading}
        </h2>
        <ul class="mt-10 grid gap-5 md:grid-cols-3">
          {FEATURES.map(({ mock, label, title, body }) => (
            <li class="landing-rise flex flex-col rounded-2xl bg-card p-5 shadow-soft">
              <Mock name={mock} />
              <p class="mt-6 text-sm font-semibold text-primary" data-i18n={label}>
                {t[label]}
              </p>
              <h3 class="mt-1.5 text-xl font-semibold tracking-tight text-balance sm:text-2xl" data-i18n={title}>
                {t[title]}
              </h3>
              <p class="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground" data-i18n={body}>
                {t[body]}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Privacy, said once, on a Charcoal band (the card's colour in Dark): the promise and the policy on
 * one side, the three reasons on the other. */
export function LandingPoints({ lang }: { lang: SiteLanguage }) {
  const t = landingCopy[lang];
  const points = [
    ["iphone", "localTitle", "localBody"],
    ["offline", "offlineTitle", "offlineBody"],
    ["feed", "feedTitle", "feedBody"],
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
