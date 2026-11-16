import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { siteMedia, siteVideos } from "../src/.generated/media";
import { FALLBACK_LANGUAGE, landingCopy, readerLanguage, resolveRequestLanguage } from "../src/landing-i18n";
import { privacyDocument } from "../src/pages/privacy-content";
import { termsDocument } from "../src/pages/terms-content";

describe("language resolution", () => {
  it("defaults to English unless the request asks for Vietnamese", () => {
    expect(FALLBACK_LANGUAGE).toBe("en");
    for (const header of [null, undefined, "", "   ", "de-DE,de;q=0.9", "ja", "vil", "envi", "vi;q=0"]) {
      expect(readerLanguage(header)).toBe("en");
    }
  });

  it("picks the highest-weighted supported language from Accept-Language", () => {
    expect(readerLanguage("vi-VN,vi;q=0.9,en-US;q=0.8")).toBe("vi");
    expect(readerLanguage("  VI-vn , en;q=0.8")).toBe("vi");
    expect(readerLanguage("en-US,en;q=0.9,vi;q=0.8")).toBe("en");
    expect(readerLanguage("fr-FR, vi-VN;q=0.8, de;q=0.7")).toBe("vi");
    expect(readerLanguage("en;q=0.4, vi;q=0.9")).toBe("vi");
  });

  it("lets a valid preference cookie override Accept-Language", () => {
    expect(resolveRequestLanguage({ cookie: "vi", acceptLanguage: "en-US,en;q=0.9" })).toBe("vi");
    expect(resolveRequestLanguage({ cookie: "en", acceptLanguage: "vi-VN,vi;q=0.9" })).toBe("en");
    expect(resolveRequestLanguage({ cookie: "fr", acceptLanguage: "vi-VN" })).toBe("vi");
  });
});

describe("web", () => {
  it("answers an unknown link with a page in the requested language and no script", async () => {
    const response = await exports.default.fetch("https://carodo.test/t/unknown");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Page not found");
    expect(html).not.toContain("<script");

    const viResponse = await exports.default.fetch("https://carodo.test/t/unknown", {
      headers: { "Accept-Language": "vi-VN,vi;q=0.9" },
    });
    expect(viResponse.status).toBe(404);
    const viHtml = await viResponse.text();
    expect(viHtml).toContain('<html lang="vi">');
    expect(viHtml).toContain("Không tìm thấy trang");
    expect(viHtml).not.toContain("<script");
  });

  it("reaches the api through the service binding", async () => {
    expect(await env.API.ping()).toEqual({ environment: "test-api" });
  });

  it("serves the landing page in English by default", async () => {
    const response = await exports.default.fetch("https://carodo.test/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("vary")).toBe("Accept-Language, Cookie");
    expect(response.headers.get("set-cookie")).toBeNull();
    const html = await response.text();
    expect(html).toContain("Carodo");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(`<title>${landingCopy.en.title}</title>`);
    expect(html).toContain("Your private driving journal.");
    expect(html).toContain('id="landing-title"');
    expect(html).toContain('<span id="landing-language-label">EN</span>');
    expect(html).toContain('aria-label="Switch to Vietnamese"');
    expect(html).toContain('id="landing-language"');
    // The language switch carries both dictionaries.
    expect(html).toContain("Nhật ký lái xe của riêng bạn.");
    expect(html).toContain("Your private driving journal on iPhone");
    expect(html).toContain("<script");
  });

  it("renders Vietnamese when requested by Accept-Language or cookie, and cookie wins", async () => {
    const viByHeader = await (
      await exports.default.fetch("https://carodo.test/", {
        headers: { "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8" },
      })
    ).text();
    expect(viByHeader).toContain('<html lang="vi">');
    expect(viByHeader).toContain(`<title>${landingCopy.vi.title}</title>`);
    expect(viByHeader).toContain('data-i18n="headline">Nhật ký lái xe của riêng bạn.</span>');
    expect(viByHeader).toContain('<span id="landing-language-label">VI</span>');

    const enByCookie = await (
      await exports.default.fetch("https://carodo.test/", {
        headers: {
          "Accept-Language": "vi-VN,vi;q=0.9",
          Cookie: "lng=en",
        },
      })
    ).text();
    expect(enByCookie).toContain('<html lang="en">');
    expect(enByCookie).toContain(`<title>${landingCopy.en.title}</title>`);

    const viByCookie = await (
      await exports.default.fetch("https://carodo.test/privacy", {
        headers: {
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: "lng=vi",
        },
      })
    ).text();
    expect(viByCookie).toContain('<html lang="vi">');
    expect(viByCookie).toContain(`<title>${privacyDocument.copy.vi.title}</title>`);
  });

  it("has translations for every displayed landing string and accessible label", async () => {
    const html = await (await exports.default.fetch("https://carodo.test/")).text();
    const keys = [...html.matchAll(/data-i18n(?:-aria|-alt)?="([^"]+)"/g)].map((match) => match[1] ?? "");
    for (const key of keys) {
      expect(landingCopy.vi).toHaveProperty(key);
      expect(landingCopy.en).toHaveProperty(key);
    }
    expect(Object.keys(landingCopy.en).sort()).toEqual(Object.keys(landingCopy.vi).sort());
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toContain('data-i18n-aria="appStoreLabel"');
    expect(header).not.toContain('href="/privacy"');
    expect(header).not.toContain('href="/terms"');
  });

  it.each(["/", "/privacy", "/terms"])("ships compiled CSS without a browser styling runtime on %s", async (path) => {
    const html = await (await exports.default.fetch(`https://carodo.test${path}`)).text();
    const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    expect(css).toContain(".bg-background");
    expect(css).toContain(".typeset");
    expect(css).toContain("prefers-color-scheme:dark");
    expect(css).not.toMatch(/@(import|source|theme)\b/);
    expect(html).not.toContain("cdn.tailwindcss.com");
    if (path !== "/") {
      expect(html).toContain('<article class="typeset typeset-carodo min-w-0"');
      expect(html).toContain('data-i18n-aria="heading"');
    }
  });

  it("serves the privacy policy", async () => {
    const response = await exports.default.fetch("https://carodo.test/privacy");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("support@carodo.app");
    expect(html).toContain("We run no server that receives your routes or your location history.");
    expect(html).toContain("Chúng tôi không vận hành máy chủ nào nhận lộ trình hoặc lịch sử vị trí của bạn.");
    expect(html).toContain("Nhật ký chỉ được gửi đi khi bạn chủ động chia sẻ.");
    // Not in the app: the policy never describes them.
    for (const absent of ["share link", "liên kết chia sẻ", "Live status", "Show my area"]) {
      expect(html).not.toContain(absent);
    }
    expect(html).toContain('id="landing-language"');
    expect(html).toContain("Privacy Policy — Carodo");
    expect(html).toContain("Chính sách quyền riêng tư — Carodo");
  });

  it("serves the terms of service", async () => {
    const response = await exports.default.fetch("https://carodo.test/terms");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Terms of Use");
    expect(html).toContain("support@carodo.app");
    expect(html).toContain("Drive safely");
    expect(html).toContain("Lái xe an toàn");
    expect(html).toContain("Feed và quy tắc cộng đồng");
    expect(html).toContain('href="/privacy"');
    expect(html).not.toContain("legal-review");
    expect(html).toContain('id="landing-language"');
    expect(html).toContain("Terms of Use — Carodo");
    expect(html).toContain("Điều khoản sử dụng — Carodo");
  });

  it.each([
    ["/privacy", privacyDocument],
    ["/terms", termsDocument],
  ] as const)("uses the shared site shell and complete translations on %s", async (path, document) => {
    const html = await (await exports.default.fetch(`https://carodo.test${path}`)).text();
    expect(html).toContain(`<title>${document.copy.en.title}</title>`);
    expect(html).not.toContain("fonts.googleapis.com");
    expect(Object.keys(document.copy.vi).sort()).toEqual(Object.keys(document.copy.en).sort());
    // The shell's own strings (footer, header) share the page's dictionary: a document key that
    // reused one of their names would replace that string on the page.
    const shared = Object.keys(document.copy.en).filter((key) => key in landingCopy.en);
    expect(shared.sort()).toEqual(["description", "title"]);
    for (const [, key] of html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)) {
      expect({ ...landingCopy.vi, ...document.copy.vi, legalLabel: "", lastUpdated: "" }).toHaveProperty(key ?? "");
      expect({ ...landingCopy.en, ...document.copy.en, legalLabel: "", lastUpdated: "" }).toHaveProperty(key ?? "");
    }
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toContain('data-i18n="backHome">Home</span>');
    expect(header).not.toContain('data-i18n-aria="appStoreLabel"');
    expect(header).toContain('id="landing-language"');
    expect(html).toContain(`data-i18n="legalLabel">${path === "/terms" ? "Terms" : "Privacy"}</p>`);
    expect(header).not.toContain('href="/privacy"');
    expect(header).not.toContain('href="/terms"');
  });

  it("includes header and footer on every page", async () => {
    for (const path of ["/", "/privacy", "/terms"]) {
      const response = await exports.default.fetch(`https://carodo.test${path}`);
      const html = await response.text();
      expect(html).toContain('<header class="sticky');
      expect(html).toContain("<footer");
      expect(html).toContain('href="/privacy"');
      expect(html).toContain('href="/terms"');
    }
  });

  it("404 page also uses the shared layout", async () => {
    const response = await exports.default.fetch("https://carodo.test/nonexistent");
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain('<header class="sticky');
    expect(html).toContain("<footer");
  });

  it("serves the landing's images from memory, cached for good, and nothing else under /media", async () => {
    const html = await (await exports.default.fetch("https://carodo.test/")).text();
    const paths = [...html.matchAll(/(?:src|srcset)="(\/media\/[^"]+\.jpg)"/g)].map((match) => match[1] ?? "");
    const screens = Object.values(siteMedia).filter((image) => image.type === "image/jpeg");
    expect(new Set(paths)).toEqual(new Set(screens.map((image) => image.path)));
    for (const path of paths) {
      const response = await exports.default.fetch(`https://carodo.test${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
      expect(response.headers.get("cache-control")).toContain("immutable");
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
    }
    expect((await exports.default.fetch("https://carodo.test/media/unknown.jpg")).status).toBe(404);
  });

  it("pairs every screen with its Dark twin, chosen by the reader's system", async () => {
    const html = await (await exports.default.fetch("https://carodo.test/")).text();
    const pictures = [...html.matchAll(/<picture>(.*?)<\/picture>/g)].map((match) => match[1] ?? "");
    expect(pictures).toHaveLength(3);
    for (const picture of pictures) {
      const dark = picture.match(
        /<source media="\(prefers-color-scheme: dark\)" srcset="\/media\/([a-z0-9-]+)-dark\./,
      )?.[1];
      const light = picture.match(/<img src="\/media\/([a-z0-9-]+)\./)?.[1];
      expect(dark).toBeDefined();
      expect(dark).toBe(light);
    }
  });

  it("plays the Replay clip from the media bucket over its still, Dark first, without a poster", async () => {
    const html = await (await exports.default.fetch("https://carodo.test/")).text();
    const video =
      html.match(/<div aria-hidden="true" class="[^"]*motion-reduce:hidden"><video[^>]*>(.*?)<\/video>/)?.[0] ?? "";
    expect(video).toMatch(/autoplay="" muted="" loop="" playsinline=""/);
    expect(video).not.toContain("poster");
    const sources = [...video.matchAll(/<source([^>]*)>/g)].map((match) => match[1] ?? "");
    expect(sources).toHaveLength(2);
    expect(sources[0]).toContain('media="(prefers-color-scheme: dark)"');
    expect(sources[0]).toContain(`src="${siteVideos["replay-clip-dark"]?.url}"`);
    expect(sources[1]).toContain(`src="${siteVideos["replay-clip"]?.url}"`);
    for (const video of Object.values(siteVideos)) {
      expect(video.url).toMatch(/^https:\/\/media\.carodo\.app\/[a-z-]+\.[0-9a-f]{10}\.mp4$/);
    }
  });

  it("gives every page a link preview with an absolute image the Worker serves", async () => {
    for (const path of ["/", "/privacy", "/terms"]) {
      const html = await (await exports.default.fetch(`https://carodo.test${path}?ref=x`)).text();
      expect(html).toContain(`<meta property="og:url" content="https://carodo.test${path}"/>`);
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image"/>');
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
      expect(html).toContain(`<meta property="og:title" content="${title}"/>`);
      expect(html).toContain('<meta property="og:description"');
      const image = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? "";
      expect(image).toMatch(/^https:\/\/carodo\.test\/media\/og-image\.[0-9a-f]{10}\.png$/);
      expect(html).toContain('<meta property="og:image:width" content="1200"/>');
      expect(html).toContain('<meta property="og:image:height" content="630"/>');
      const response = await exports.default.fetch(image);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
    }
    const vi = await (await exports.default.fetch("https://carodo.test/", { headers: { Cookie: "lng=vi" } })).text();
    expect(vi).toContain('<meta property="og:locale" content="vi_VN"/>');
    const missing = await (await exports.default.fetch("https://carodo.test/nonexistent")).text();
    expect(missing).not.toContain("og:image");
  });

  it("serves the icons the head and the manifest name", async () => {
    const touch = await exports.default.fetch("https://carodo.test/apple-touch-icon.png");
    expect(touch.status).toBe(200);
    expect(touch.headers.get("content-type")).toBe("image/png");
    const manifest = (await (await exports.default.fetch("https://carodo.test/site.webmanifest")).json()) as {
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest.icons.map((icon) => icon.purpose ?? "any")).toEqual(["any", "any", "maskable"]);
    for (const icon of manifest.icons) {
      const response = await exports.default.fetch(`https://carodo.test${icon.src}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
    }
  });

  it("serves favicon.svg with correct content type", async () => {
    const response = await exports.default.fetch("https://carodo.test/favicon.svg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    const body = await response.text();
    expect(body).toContain("<svg");
    expect(body).toContain("#242321");
  });

  it("serves site.webmanifest", async () => {
    const response = await exports.default.fetch("https://carodo.test/site.webmanifest");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/manifest+json");
    const manifest = (await response.json()) as { name: string };
    expect(manifest.name).toBe("Carodo");
  });

  it("redirects favicon.ico to favicon.svg", async () => {
    const response = await exports.default.fetch("https://carodo.test/favicon.ico", { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/favicon.svg");
  });
});
