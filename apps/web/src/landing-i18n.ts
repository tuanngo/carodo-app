export const SUPPORTED_LANGUAGES = ["en", "vi"] as const;
export type SiteLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** English everywhere unless the request asks for Vietnamese (a stored preference or `Accept-Language`). */
export const FALLBACK_LANGUAGE: SiteLanguage = "en";
export const LANGUAGE_COOKIE = "lng";

export function isSiteLanguage(value: string | null | undefined): value is SiteLanguage {
  return value === "en" || value === "vi";
}

/**
 * Picks the highest-ranked supported language from an `Accept-Language` header (RFC 9110 §12.5.4),
 * falling back to English when the header is absent, malformed or names only other languages.
 */
export function readerLanguage(header: string | null | undefined): SiteLanguage {
  if (!header) return FALLBACK_LANGUAGE;
  let best: SiteLanguage | undefined;
  let bestWeight = 0;

  for (const rawItem of header.slice(0, 256).split(",")) {
    const parts = rawItem.trim().split(";");
    const primary = parts[0]?.trim().split("-")[0]?.toLowerCase();
    if (!isSiteLanguage(primary)) continue;

    let weight = 1;
    for (let i = 1; i < parts.length; i++) {
      const param = parts[i]?.trim() ?? "";
      if (param.slice(0, 2).toLowerCase() === "q=") {
        const parsed = Number(param.slice(2).trim());
        weight = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : -1;
        break;
      }
    }
    if (weight > bestWeight) {
      bestWeight = weight;
      best = primary;
    }
  }

  return best ?? FALLBACK_LANGUAGE;
}

export function resolveRequestLanguage({
  cookie,
  acceptLanguage,
}: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): SiteLanguage {
  return isSiteLanguage(cookie) ? cookie : readerLanguage(acceptLanguage);
}

export const notFoundCopy: Record<SiteLanguage, { title: string; heading: string; body: string }> = {
  en: {
    title: "Not found · Carodo",
    heading: "Page not found",
    body: "Check the address or use the Carodo logo to return to the home page.",
  },
  vi: {
    title: "Không tìm thấy · Carodo",
    heading: "Không tìm thấy trang",
    body: "Bạn hãy kiểm tra lại đường dẫn hoặc chọn biểu tượng Carodo để về trang chủ.",
  },
};

/** Feature names (Journeys, Auto Mode, Feed) follow iOS Common/Journeys/Settings.xcstrings. */
export const landingCopy = {
  vi: {
    title: "Carodo — Nhật ký lái xe trên iPhone",
    description:
      "Nhật ký lái xe trên iPhone: lưu lộ trình, quãng đường và thời gian của từng chuyến đi. Không cần mạng hay tài khoản để ghi chuyến.",
    badge: "Nhật ký riêng tư · Ghi cả khi mất sóng",
    headline: "Nhật ký lái xe của riêng bạn.",
    headlineAccent: "Lưu từng chuyến đi trên iPhone.",
    intro:
      "Lưu lại những cung đường đã qua, quãng đường, thời gian và chiếc xe bạn đã lái. Mở Hành trình để xem lại từng chuyến, hoặc bật Auto Mode để Carodo tự động ghi chuyến đi.",
    trust: "Không cần tài khoản · Không quảng cáo · Sao lưu lên iCloud của bạn",
    screens: "Carodo trên iPhone",
    featuresHeading: "Lưu chuyến đi. Xem lại kỷ niệm.",
    autoLabel: "Auto Mode",
    autoTitle: "Tự động ghi chuyến đi",
    autoBody:
      "Bật Auto Mode để Carodo nhận biết khi bạn bắt đầu lái và tự ghi chuyến đi, kể cả khi ứng dụng đang chạy nền. Liên kết CarPlay hoặc Bluetooth để Carodo biết bạn đang lái xe nào.",
    journalLabel: "Hành trình",
    journalTitle: "Mỗi chuyến, một trang nhật ký",
    journalBody:
      "Xem lại lộ trình trên bản đồ, điểm xuất phát, điểm đến, thời gian, quãng đường và chiếc xe bạn đã lái. Tất cả nằm trong nhật ký riêng của bạn.",
    autoAlt:
      "Đang ghi chuyến trong Carodo: chiếc xe trên đường đèo Hải Vân cạnh biển, kèm quãng đường và tốc độ trực tiếp",
    journalAlt: "Chi tiết chuyến đi qua đèo Hải Vân trong Carodo, từ phường Hải Vân đến Chân Mây - Lăng Cô",
    replayAlt:
      "Một khung hình video Phát lại: chiếc xe leo đèo Hải Vân cạnh biển, kèm quãng đường, thời gian và tốc độ",
    replayLabel: "Phát lại chuyến đi",
    replayTitle: "Xem lại từng cung đường",
    replayBody:
      "Theo dõi chuyến đi trên bản đồ, từ lúc xuất phát đến khi kết thúc, cùng tốc độ tại từng thời điểm. Bạn cũng có thể lưu chuyến đi thành video ngắn để xem lại.",
    localTitle: "Lưu trên iPhone",
    localBody:
      "Nhật ký được lưu trên iPhone và sao lưu lên iCloud của bạn nếu bật sao lưu. Chúng tôi không nhận lộ trình của bạn trên máy chủ.",
    offlineTitle: "Ghi cả khi mất sóng",
    offlineBody: "Bạn có thể ghi chuyến đi mà không cần mạng hay tài khoản.",
    feedTitle: "Chia sẻ trên Feed khi bạn muốn",
    feedBody:
      "Bạn tự chọn có chia sẻ lên Feed hay không, dưới tên “Ai đó” hoặc tên người dùng của mình. Feed cho thấy cách bạn lái xe, không tiết lộ nơi bạn đi.",
    privacyHeading: "Riêng tư từ thiết kế.",
    privacyLead:
      "Những gì bạn ghi là của riêng bạn. Carodo không có máy chủ nhận lộ trình của bạn, không quảng cáo, không theo dõi.",
    faqHeading: "Câu hỏi thường gặp",
    faqOffline: "Có cần mạng để ghi chuyến đi không?",
    faqOfflineAnswer: "Không. Carodo ghi lại chuyến đi trên iPhone ngay cả khi không có kết nối mạng.",
    faqAccount: "Có cần tạo tài khoản không?",
    faqAccountAnswer:
      "Không. Bạn có thể ghi chuyến đi, xem Hành trình và sao lưu lên iCloud mà không cần tài khoản Carodo.",
    faqAutoOff: "Tắt Auto Mode thì Carodo còn ghi chuyến không?",
    faqAutoOffAnswer:
      "Có. Bạn vẫn có thể chọn Bắt đầu lái, dùng Siri hoặc Phím tắt để ghi chuyến đi. Carodo cũng có thể bắt đầu ghi khi bạn mở ứng dụng trong lúc đang kết nối với xe đã liên kết.",
    faqBattery: "Auto Mode có làm hao pin không?",
    faqBatteryAnswer:
      "Khi ghi chuyến đi, Carodo dùng GPS nên sẽ tốn pin hơn. Giữa các chuyến, Auto Mode nhận biết chuyển động bằng cơ chế ít tốn pin hơn. Với chuyến đi dài, bạn có thể cắm sạc cho iPhone.",
    faqPrivacy: "Nhật ký được lưu ở đâu?",
    faqPrivacyAnswer: "Nhật ký được lưu trên iPhone và sao lưu lên iCloud của bạn nếu bật sao lưu. Xem thêm trong",
    privacy: "Quyền riêng tư",
    privacyPolicy: "Chính sách quyền riêng tư",
    terms: "Điều khoản",
    termsService: "Điều khoản sử dụng",
    contact: "Liên hệ",
    rights: "Bảo lưu mọi quyền.",
    languageAction: "Đổi sang tiếng Anh",
    home: "Carodo — Trang chủ",
    backHome: "Trang chủ",
    appStore: "Sắp có trên",
    appStoreLabel: "Carodo — Sắp có trên App Store",
  },
  en: {
    title: "Carodo — Your private driving journal on iPhone",
    description:
      "A private driving journal for iPhone. Record your routes, distances and drive times, even offline. No account needed to record.",
    badge: "Private by default · Records offline",
    headline: "Your private driving journal.",
    headlineAccent: "Every drive, kept on your iPhone.",
    intro:
      "Keep a record of where you drove, how far, how long and which car you used. Look back at any drive in Journeys, or turn on Auto Mode to record automatically.",
    trust: "No account needed · No ads · Backup to your own iCloud",
    screens: "Carodo on iPhone",
    featuresHeading: "Record it. Keep it. Relive it.",
    autoLabel: "Auto Mode",
    autoTitle: "Record drives automatically",
    autoBody:
      "Turn on Auto Mode and Carodo detects when you start driving and records the drive, even while the app is in the background. Link CarPlay or Bluetooth so Carodo knows which car you’re driving.",
    journalLabel: "Journeys",
    journalTitle: "A page for every drive",
    journalBody:
      "Look back at your route on the map, start and end points, duration, distance and the car you drove. All in your own private journal.",
    autoAlt:
      "Recording a drive in Carodo: the car on the Hải Vân pass road by the sea, with the live distance and speed",
    journalAlt: "A drive's page in Carodo: the Hải Vân pass from P. Hải Vân to Chân Mây - Lăng Cô, above Đà Nẵng bay",
    replayAlt:
      "A frame of a Replay video: the car climbing the Hải Vân pass beside the sea, with distance, time and speed",
    replayLabel: "Replay",
    replayTitle: "Relive it, turn by turn",
    replayBody:
      "Watch your drive unfold on the map, from start to finish, with your speed at each moment. You can also save it as a short video to watch later.",
    localTitle: "Kept on your iPhone",
    localBody:
      "Your journal stays on your iPhone, with a copy in your own iCloud if backup is on. Our servers do not receive your routes.",
    offlineTitle: "Records offline",
    offlineBody: "Record drives without an internet connection or an account.",
    feedTitle: "Share on the Feed if you choose",
    feedBody:
      "You choose whether to share on the Feed, as “Someone” or under your username. It shows how you drive without revealing where you go.",
    privacyHeading: "Private by design.",
    privacyLead: "What you record is yours. Carodo has no server that receives your routes, no ads and no tracking.",
    faqHeading: "Frequently asked questions",
    faqOffline: "Do I need a connection to record?",
    faqOfflineAnswer: "No. Carodo records drives on your iPhone even without a network connection.",
    faqAccount: "Do I need an account?",
    faqAccountAnswer: "No. You can record drives, browse Journeys and back up to iCloud without a Carodo account.",
    faqAutoOff: "Does Carodo still record with Auto Mode off?",
    faqAutoOffAnswer:
      "Yes. You can use Start Drive, Siri or a Shortcut. Opening Carodo while connected to a linked car can also start recording.",
    faqBattery: "Does Auto Mode drain the battery?",
    faqBatteryAnswer:
      "Recording a drive uses more battery because GPS is active. Between drives, Auto Mode uses lower-power movement updates. Charging during longer drives can help.",
    faqPrivacy: "Where is my journal stored?",
    faqPrivacyAnswer: "On your iPhone, with a copy in your own iCloud if backup is on. Learn more in the",
    privacy: "Privacy",
    privacyPolicy: "Privacy Policy",
    terms: "Terms",
    termsService: "Terms of Use",
    contact: "Contact",
    rights: "All rights reserved.",
    languageAction: "Switch to Vietnamese",
    home: "Carodo — Home",
    backHome: "Home",
    appStore: "Coming soon on the",
    appStoreLabel: "Carodo — Coming soon on the App Store",
  },
} as const;

export type SiteTranslations = {
  vi: Record<string, string> & { title: string; description: string };
  en: Record<string, string> & { title: string; description: string };
};

/** Each page supplies its own metadata/body copy while sharing the browser preference. */
export function createLanguageScript(translations: SiteTranslations) {
  return `
(() => {
  const copy = ${JSON.stringify(translations).replaceAll("<", "\\u003c")};
  const button = document.getElementById("landing-language");
  const languageLabel = document.getElementById("landing-language-label");
  function apply(language) {
    const lang = language === "vi" ? "vi" : "en";
    const t = copy[lang];
    document.documentElement.lang = lang;
    document.title = t.title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = t.description;
    document.querySelectorAll("[data-i18n]").forEach(el => {
      el.textContent = t[el.dataset.i18n];
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(el => {
      el.setAttribute("aria-label", t[el.dataset.i18nAria]);
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(el => {
      el.setAttribute("alt", t[el.dataset.i18nAlt]);
    });
    languageLabel.textContent = lang.toUpperCase();
    button.setAttribute("aria-label", t.languageAction);
    button.title = t.languageAction;
    document.dispatchEvent(new Event("carodo:languagechange"));
  }
  function hasLanguageCookie() {
    return document.cookie.split(";").some(part => {
      const [name, value] = part.trim().split("=");
      return name === "${LANGUAGE_COOKIE}" && (value === "en" || value === "vi");
    });
  }
  function persist(lang) {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = "${LANGUAGE_COOKIE}=" + lang + "; Path=/; Max-Age=31536000; SameSite=Lax" + secure;
    try { localStorage.setItem("carodo.language", lang); } catch {}
  }
  if (!hasLanguageCookie()) {
    let stored = null;
    try { stored = localStorage.getItem("carodo.language"); } catch {}
    if ((stored === "en" || stored === "vi") && stored !== document.documentElement.lang) {
      apply(stored);
    }
  }
  button.addEventListener("click", () => {
    const next = document.documentElement.lang === "vi" ? "en" : "vi";
    apply(next);
    persist(next);
  });
  button.hidden = false;
})();
`;
}
