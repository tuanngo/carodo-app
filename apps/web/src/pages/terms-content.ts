import type { LegalDocument } from "./legal-page";

/**
 * The Terms of Use, in the app's two languages. Short on purpose: Apple’s standard EULA covers the
 * licence; the privacy policy covers data. These terms add driving safety, Feed community rules
 * (App Review 1.2), and basic service limits. Honest about the optional Feed on our servers.
 */
export const termsDocument: LegalDocument = {
  copy: {
    en: {
      heading: "Terms of Use",
      effective: "Last updated: November 18, 2026",
      summary:
        "These terms apply to the Carodo app for iPhone and to carodo.app. By using Carodo, you agree to them. They add to Apple’s standard",
      summaryLink: "Licensed Application End User License Agreement",

      appHeading: "1. The app",
      appLead: "What Carodo is.",
      app: "Carodo is a private driving journal: it records drives on your iPhone and lets you look back at them. The Carodo name, logo and app remain ours; we license the app to you for personal use.",

      safetyHeading: "2. Drive safely",
      safetyLead: "Not navigation or a safety device.",
      safety1:
        "Carodo is a journal, not a navigation system, a safety device or an emergency service. Set it up before you set off and do not operate the app while driving. You are always responsible for driving safely and for obeying traffic law.",
      accuracyLead: "Accuracy.",
      safety2:
        "Routes, distances, speeds and times depend on GPS and your iPhone, so they may be incomplete or inaccurate. GPS distance is different from your car’s odometer. Do not use Carodo data as evidence or an official record, including for speed verification, tax or insurance.",

      dataHeading: "3. Your data",
      dataLead: "Yours on the device.",
      data: "Your drives belong to you. They are stored on your iPhone and, if you turn backup on, in your own iCloud. How data is handled, including the optional Feed, is described in the",
      dataLink: "Privacy Policy",

      feedHeading: "4. The Feed (optional)",
      feedLead: "Community rules.",
      feed1:
        "The Feed is optional. To join you choose a username and must be at least 13. You are responsible for your username and what you share. You must not:",
      feedRule1: "Pretend to be another person, a brand or Carodo",
      feedRule2: "Use a username that is offensive, hateful, sexual or unlawful",
      feedRule3: "Harass, threaten or abuse other people",
      feedRule4: "Publish drives that did not happen, or post or react other than through the Carodo app",
      feed2:
        "We may remove content, reclaim a username, or suspend or close an account that breaks these rules. To report a username or a drive, write to",
      emailLink: "support@carodo.app",
      feed3Lead: "Your shared drives.",
      feed3:
        "What you share stays yours. By sharing, you allow us to show it in the Feed until you remove it. You can stop sharing or delete your account in the app at any time.",

      useHeading: "5. Acceptable use",
      use: "Do not use Carodo to break the law, reach other people’s data or accounts, disrupt or overload the service, or access it other than through the Carodo app.",

      availabilityHeading: "6. Availability",
      availabilityLead: "On device vs online.",
      availability:
        "Recording and your journal work on your iPhone without our servers. The Feed and this website depend on our servers; we try to keep them running but do not promise constant availability, and we may change or end a feature.",

      liabilityHeading: "7. Warranty and liability",
      liability:
        "Carodo is provided “as is”, without warranties of any kind, to the extent the law allows. To the same extent, we are not liable for indirect or consequential loss from your use of Carodo, including lost data. Nothing in these terms limits the rights the law of your country gives you as a consumer.",

      changesHeading: "8. Changes",
      changes:
        "We may update these terms when Carodo changes. The current version is always on this page, with the date at the top. If you keep using Carodo after a change, you accept the new terms.",

      contactHeading: "9. Contact",
      contactBody: "Questions about these terms:",

      title: "Terms of Use · Carodo",
      description:
        "Terms of Use for the Carodo iPhone app and carodo.app: driving safety, your data, and the optional Feed’s community rules.",
    },
    vi: {
      heading: "Điều khoản sử dụng",
      effective: "Cập nhật lần cuối: 18/11/2026",
      summary:
        "Các điều khoản này áp dụng cho ứng dụng Carodo trên iPhone và website carodo.app. Khi dùng Carodo, bạn đồng ý với chúng. Chúng bổ sung thoả thuận chuẩn của Apple:",
      summaryLink: "Licensed Application End User License Agreement",

      appHeading: "1. Ứng dụng",
      appLead: "Carodo là gì.",
      app: "Carodo là nhật ký lái xe riêng tư: ghi chuyến trên iPhone và giúp bạn xem lại. Tên Carodo, logo và ứng dụng thuộc về chúng tôi; chúng tôi cấp quyền dùng cho mục đích cá nhân.",

      safetyHeading: "2. Lái xe an toàn",
      safetyLead: "Không phải dẫn đường hay thiết bị an toàn.",
      safety1:
        "Carodo là nhật ký, không phải hệ thống dẫn đường, thiết bị an toàn hay dịch vụ khẩn cấp. Hãy thiết lập trước khi khởi hành và không thao tác ứng dụng khi đang lái. Bạn luôn chịu trách nhiệm lái xe an toàn và tuân thủ luật giao thông.",
      accuracyLead: "Độ chính xác.",
      safety2:
        "Lộ trình, quãng đường, tốc độ và thời gian phụ thuộc GPS và iPhone, nên có thể thiếu hoặc không chính xác. Quãng đường GPS khác số trên công-tơ-mét. Không dùng dữ liệu Carodo làm bằng chứng hay hồ sơ chính thức, kể cả xác nhận tốc độ, thuế hoặc bảo hiểm.",

      dataHeading: "3. Dữ liệu của bạn",
      dataLead: "Của bạn trên thiết bị.",
      data: "Chuyến đi thuộc về bạn, lưu trên iPhone và trong iCloud nếu bạn bật sao lưu. Cách xử lý dữ liệu, kể cả Feed tuỳ chọn, nằm trong",
      dataLink: "Chính sách quyền riêng tư",

      feedHeading: "4. Feed (tuỳ chọn)",
      feedLead: "Quy tắc cộng đồng.",
      feed1:
        "Feed là tuỳ chọn. Để tham gia bạn chọn tên người dùng và phải từ 13 tuổi. Bạn chịu trách nhiệm về tên và nội dung chia sẻ. Bạn không được:",
      feedRule1: "Mạo danh người khác, thương hiệu hoặc Carodo",
      feedRule2: "Dùng tên xúc phạm, thù ghét, khiêu dâm hoặc trái pháp luật",
      feedRule3: "Quấy rối, đe doạ hoặc lăng mạ người khác",
      feedRule4: "Đăng chuyến không có thật, hoặc đăng / thả cảm xúc ngoài ứng dụng Carodo",
      feed2:
        "Chúng tôi có thể gỡ nội dung, thu hồi tên, tạm ngưng hoặc đóng tài khoản vi phạm. Để báo cáo, gửi email đến",
      emailLink: "support@carodo.app",
      feed3Lead: "Nội dung bạn chia sẻ.",
      feed3:
        "Những gì bạn chia sẻ vẫn là của bạn. Khi chia sẻ, bạn cho phép hiện trên Feed đến khi bạn gỡ. Bạn có thể dừng chia sẻ hoặc xoá tài khoản trong ứng dụng bất cứ lúc nào.",

      useHeading: "5. Quy định sử dụng",
      use: "Không dùng Carodo để phá luật, truy cập dữ liệu hoặc tài khoản người khác, làm gián đoạn hoặc quá tải dịch vụ, hay truy cập ngoài ứng dụng Carodo.",

      availabilityHeading: "6. Khả năng hoạt động",
      availabilityLead: "Trên máy và trực tuyến.",
      availability:
        "Ghi chuyến và nhật ký chạy trên iPhone không cần máy chủ của chúng tôi. Feed và website phụ thuộc máy chủ; chúng tôi cố gắng duy trì nhưng không cam kết luôn sẵn sàng, và có thể đổi hoặc ngừng một tính năng.",

      liabilityHeading: "7. Bảo đảm và trách nhiệm",
      liability:
        "Carodo được cung cấp “nguyên trạng”, không kèm bảo đảm, trong phạm vi pháp luật cho phép. Cũng trong phạm vi đó, chúng tôi không chịu trách nhiệm thiệt hại gián tiếp hoặc hệ quả từ việc dùng Carodo, kể cả mất dữ liệu. Không điều gì hạn chế quyền người tiêu dùng theo luật nước bạn.",

      changesHeading: "8. Thay đổi",
      changes:
        "Chúng tôi có thể cập nhật điều khoản khi Carodo đổi. Bản hiện hành luôn ở trang này, kèm ngày ở đầu. Tiếp tục dùng sau khi đổi nghĩa là bạn chấp nhận điều khoản mới.",

      contactHeading: "9. Liên hệ",
      contactBody: "Câu hỏi về các điều khoản này:",

      title: "Điều khoản sử dụng · Carodo",
      description:
        "Điều khoản sử dụng ứng dụng Carodo trên iPhone và carodo.app: an toàn khi lái, dữ liệu của bạn, và quy tắc cộng đồng của Feed tuỳ chọn.",
    },
  },
  blocks: [
    {
      kind: "paragraph",
      key: "summary",
      href: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
      labelKey: "summaryLink",
    },

    { kind: "heading", key: "appHeading" },
    { kind: "paragraph", key: "app", leadKey: "appLead" },

    { kind: "heading", key: "safetyHeading" },
    { kind: "paragraph", key: "safety1", leadKey: "safetyLead" },
    { kind: "paragraph", key: "safety2", leadKey: "accuracyLead" },

    { kind: "heading", key: "dataHeading" },
    { kind: "paragraph", key: "data", leadKey: "dataLead", href: "/privacy", labelKey: "dataLink" },

    { kind: "heading", key: "feedHeading" },
    { kind: "paragraph", key: "feed1", leadKey: "feedLead" },
    { kind: "list", key: "feedRules", items: ["feedRule1", "feedRule2", "feedRule3", "feedRule4"] },
    { kind: "paragraph", key: "feed2", href: "mailto:support@carodo.app", labelKey: "emailLink" },
    { kind: "paragraph", key: "feed3", leadKey: "feed3Lead" },

    { kind: "heading", key: "useHeading" },
    { kind: "paragraph", key: "use" },

    { kind: "heading", key: "availabilityHeading" },
    { kind: "paragraph", key: "availability", leadKey: "availabilityLead" },

    { kind: "heading", key: "liabilityHeading" },
    { kind: "paragraph", key: "liability" },

    { kind: "heading", key: "changesHeading" },
    { kind: "paragraph", key: "changes" },

    { kind: "heading", key: "contactHeading" },
    { kind: "paragraph", key: "contactBody", href: "mailto:support@carodo.app", labelKey: "emailLink" },
  ],
};
