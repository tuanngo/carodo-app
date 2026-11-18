import { CarodoMark } from "../brand";
import { AppStoreBadge } from "../components/site/app-store-badge";
import { landingCopy, type SiteLanguage } from "../landing-i18n";
import { Layout } from "../layout";
import { LandingCta, LandingFaq, LandingLoop, LandingPrivacy, LandingScreens } from "./landing-blocks";

/** Landing: hero, product loop (Auto Mode → Journeys → Replay), privacy, FAQ, closing CTA. No Feed. */
export function LandingPage({ lang = "en", url }: { lang?: SiteLanguage; url?: string }) {
  const t = landingCopy[lang];
  return (
    <Layout title={t.title} description={t.description} url={url} lang={lang} languageSwitcher>
      <main>
        <section
          class="mx-auto flex max-w-5xl flex-col items-center px-4 pt-12 pb-16 text-center sm:px-6 sm:pt-20 sm:pb-20"
          aria-labelledby="landing-title"
        >
          <div class="relative">
            <div aria-hidden="true" class="absolute -inset-12 -z-10 rounded-full bg-copper/20 blur-3xl" />
            <div class="grid size-24 place-items-center rounded-[1.75rem] bg-ivory text-charcoal shadow-lg ring-1 ring-charcoal/5 sm:size-28 sm:rounded-[2rem] dark:bg-charcoal dark:text-ivory dark:ring-ivory/10">
              <CarodoMark size={68} class="sm:size-20" />
            </div>
          </div>

          <h1
            id="landing-title"
            class="mt-8 max-w-4xl text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-6xl"
          >
            <span class="block" data-i18n="headline">
              {t.headline}
            </span>
            <span class="block text-primary" data-i18n="headlineAccent">
              {t.headlineAccent}
            </span>
          </h1>

          <p class="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground sm:text-xl" data-i18n="intro">
            {t.intro}
          </p>

          <div class="mt-8">
            <AppStoreBadge lang={lang} size="lg" />
          </div>

          <p class="mt-5 text-sm text-muted-foreground" data-i18n="trust">
            {t.trust}
          </p>

          <LandingScreens lang={lang} />
        </section>

        <LandingLoop lang={lang} />
        <LandingPrivacy lang={lang} />
        <LandingFaq lang={lang} />
        <LandingCta lang={lang} />
      </main>
    </Layout>
  );
}
