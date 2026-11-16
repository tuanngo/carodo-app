import type { LegalDocument } from "./legal-page";

/**
 * The Terms of Use, in the app's two languages: what using Carodo and joining the Feed accept, the
 * community rules included (App Review guideline 1.2). The app links here from Claim and About
 * (carodo-ios `Configuration.termsURL`). Short on purpose: the licence itself is Apple's standard
 * EULA, and how data is handled is the privacy policy's business.
 */
export const termsDocument: LegalDocument = {
  copy: {
    en: {
      heading: "Terms of Use",
      effective: "Last updated: November 15, 2026",
      summary:
        "These terms apply to the Carodo app for iPhone and to carodo.app. By using Carodo, you agree to these terms.",

      appHeading: "1. The app",
      app: "Carodo is a drive journal: it records your drives on your iPhone and lets you look back at them. The Carodo name, logo and app remain ours; we license the app to you for your personal use. These terms add to Apple’s standard",
      appLink: "Licensed Application End User License Agreement",

      safetyHeading: "2. Drive safely",
      safety1:
        "Carodo is a journal, not a navigation system, a safety device or an emergency service. Set it up before you set off and do not operate the app while driving. You are always responsible for driving safely and for obeying traffic law.",
      safety2:
        "Recorded routes, distances, speeds and times depend on GPS and your iPhone, so they may be incomplete or inaccurate. GPS distance is different from your car’s odometer reading. Do not use Carodo data as evidence or an official record, including for speed verification, tax or insurance purposes.",

      dataHeading: "3. Your data",
      data: "Your drives belong to you. They are stored on your iPhone and, if you use it, in your own iCloud. We hold no copy and cannot restore them for you, so keep a backup. How data is handled is described in the",
      dataLink: "Privacy Policy",

      feedHeading: "4. The Feed and community rules",
      feed1:
        "The Feed is optional. To join you choose a username, and you must be at least 13 years old. You are responsible for your username and for what you share. You must not:",
      feedRule1: "Pretend to be another person, a brand or Carodo",
      feedRule2: "Use a username that is offensive, hateful, sexual or unlawful",
      feedRule3: "Harass, threaten or abuse other people",
      feedRule4: "Publish drives that did not happen, or use anything but the Carodo app to post or react",
      feed2:
        "We do not tolerate objectionable content or abusive behaviour. We may remove content, take back a username, or suspend or close an account that breaks these rules. To report a username or a drive, write to",
      emailLink: "support@carodo.app",
      feed3:
        "What you share stays yours. By sharing it you allow us to show it in the Feed until you remove it. You can stop sharing or delete your account in the app at any time.",

      useHeading: "5. Acceptable use",
      use: "You must not use Carodo to break the law, try to reach other people’s data or accounts, disrupt or overload the service, or access it other than through the Carodo app.",

      availabilityHeading: "6. Availability",
      availability:
        "Recording and your journal work on your iPhone without our server. The Feed and this website depend on our server; we try to keep them running but do not promise that they are always available, and we may change or end a feature.",

      liabilityHeading: "7. Warranty and liability",
      liability:
        "Carodo is provided “as is”, without warranties of any kind, to the extent the law allows. To the same extent, we are not liable for indirect or consequential loss arising from your use of Carodo, lost data included. Nothing in these terms limits the rights the law of your country gives you as a consumer.",

      changesHeading: "8. Changes to these terms",
      changes:
        "We may update these terms when Carodo changes. The current version is always on this page, with the date at the top; if you keep using Carodo after a change, you accept the new terms.",

      contactHeading: "9. Contact",
      contactBody: "For questions about these terms, email",

      title: "Terms of Use — Carodo",
      description: "The terms for using the Carodo app and carodo.app, including the Feed’s community rules.",
    },
    vi: {
      heading: "Điều khoản sử dụng",
      effective: "Cập nhật lần cuối: 15/11/2026",
      summary:
        "Các điều khoản này áp dụng cho ứng dụng Carodo trên iPhone và website carodo.app. Khi sử dụng Carodo, bạn đồng ý với các điều khoản dưới đây.",

      appHeading: "1. Ứng dụng",
      app: "Carodo là nhật ký lái xe: ứng dụng ghi lại các chuyến đi trên iPhone và giúp bạn xem lại. Tên Carodo, logo và ứng dụng thuộc về chúng tôi; chúng tôi cấp quyền cho bạn dùng ứng dụng vào mục đích cá nhân. Các điều khoản này bổ sung cho thoả thuận chuẩn của Apple:",
      appLink: "Licensed Application End User License Agreement",

      safetyHeading: "2. Lái xe an toàn",
      safety1:
        "Carodo là nhật ký, không phải hệ thống dẫn đường, thiết bị an toàn hay dịch vụ khẩn cấp. Hãy thiết lập trước khi khởi hành và không thao tác với ứng dụng khi đang lái. Bạn luôn chịu trách nhiệm lái xe an toàn và tuân thủ luật giao thông.",
      safety2:
        "Lộ trình, quãng đường, tốc độ và thời gian ghi được phụ thuộc vào GPS và iPhone, nên có thể thiếu hoặc không chính xác. Quãng đường đo bằng GPS khác với số đo trên công-tơ-mét của xe. Không dùng dữ liệu Carodo làm bằng chứng hay hồ sơ chính thức, chẳng hạn để xác nhận tốc độ, kê khai thuế hoặc làm thủ tục bảo hiểm.",

      dataHeading: "3. Dữ liệu của bạn",
      data: "Dữ liệu chuyến đi thuộc về bạn, được lưu trên iPhone và trong iCloud nếu bạn bật sao lưu. Chúng tôi không giữ bản sao để khôi phục giúp bạn, vì vậy hãy chủ động sao lưu. Tìm hiểu cách Carodo xử lý dữ liệu trong",
      dataLink: "Chính sách quyền riêng tư",

      feedHeading: "4. Feed và quy tắc cộng đồng",
      feed1:
        "Feed là tính năng tuỳ chọn. Để tham gia, bạn chọn một tên người dùng và phải từ 13 tuổi trở lên. Bạn chịu trách nhiệm về tên người dùng và những gì mình chia sẻ. Bạn không được:",
      feedRule1: "Mạo danh người khác, một thương hiệu hoặc Carodo",
      feedRule2: "Dùng tên người dùng mang tính xúc phạm, thù ghét, khiêu dâm hoặc trái pháp luật",
      feedRule3: "Quấy rối, đe doạ hoặc lăng mạ người khác",
      feedRule4:
        "Đăng chuyến đi không có thật hoặc dùng công cụ khác ngoài ứng dụng Carodo để đăng bài hay thả cảm xúc",
      feed2:
        "Chúng tôi không chấp nhận nội dung phản cảm hoặc hành vi lạm dụng. Chúng tôi có thể gỡ nội dung, thu hồi tên người dùng, tạm ngưng hoặc đóng tài khoản vi phạm các quy tắc này. Để báo cáo tên người dùng hoặc chuyến đi vi phạm, hãy gửi email đến",
      emailLink: "support@carodo.app",
      feed3:
        "Những gì bạn chia sẻ vẫn là của bạn. Khi chia sẻ, bạn cho phép chúng tôi hiển thị nội dung đó trên Feed cho đến khi bạn gỡ. Bạn có thể dừng chia sẻ hoặc xoá tài khoản trong ứng dụng bất cứ lúc nào.",

      useHeading: "5. Quy định sử dụng",
      use: "Bạn không được dùng Carodo để vi phạm pháp luật, tìm cách truy cập dữ liệu hoặc tài khoản của người khác, làm gián đoạn hoặc gây quá tải dịch vụ, hay truy cập dịch vụ bằng cách nào khác ngoài ứng dụng Carodo.",

      availabilityHeading: "6. Khả năng hoạt động của dịch vụ",
      availability:
        "Bạn có thể ghi và xem lại chuyến đi trên iPhone mà không cần kết nối với máy chủ của chúng tôi. Feed và website cần máy chủ để hoạt động. Chúng tôi cố gắng duy trì các dịch vụ này nhưng không cam kết chúng luôn hoạt động liên tục, và có thể thay đổi hoặc ngừng một tính năng.",

      liabilityHeading: "7. Bảo đảm và trách nhiệm",
      liability:
        "Carodo được cung cấp “nguyên trạng”, không kèm bất kỳ bảo đảm nào, trong phạm vi pháp luật cho phép. Cũng trong phạm vi đó, chúng tôi không chịu trách nhiệm về thiệt hại gián tiếp hoặc hệ quả phát sinh từ việc bạn dùng Carodo, kể cả mất dữ liệu. Không điều gì trong các điều khoản này hạn chế quyền mà pháp luật nước bạn dành cho người tiêu dùng.",

      changesHeading: "8. Thay đổi điều khoản",
      changes:
        "Chúng tôi có thể cập nhật các điều khoản này khi Carodo thay đổi. Bản hiện hành luôn ở trang này, kèm ngày cập nhật ở đầu trang; nếu bạn tiếp tục dùng Carodo sau khi có thay đổi, bạn chấp nhận điều khoản mới.",

      contactHeading: "9. Liên hệ",
      contactBody: "Nếu có câu hỏi về các điều khoản này, bạn có thể gửi email đến",

      title: "Điều khoản sử dụng — Carodo",
      description: "Điều khoản sử dụng ứng dụng Carodo và carodo.app, gồm quy tắc cộng đồng của Feed.",
    },
  },
  blocks: [
    { kind: "paragraph", key: "summary" },

    { kind: "heading", key: "appHeading" },
    {
      kind: "paragraph",
      key: "app",
      href: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
      labelKey: "appLink",
    },

    { kind: "heading", key: "safetyHeading" },
    { kind: "paragraph", key: "safety1" },
    { kind: "paragraph", key: "safety2" },

    { kind: "heading", key: "dataHeading" },
    { kind: "paragraph", key: "data", href: "/privacy", labelKey: "dataLink" },

    { kind: "heading", key: "feedHeading" },
    { kind: "paragraph", key: "feed1" },
    { kind: "list", key: "feedRules", items: ["feedRule1", "feedRule2", "feedRule3", "feedRule4"] },
    { kind: "paragraph", key: "feed2", href: "mailto:support@carodo.app", labelKey: "emailLink" },
    { kind: "paragraph", key: "feed3" },

    { kind: "heading", key: "useHeading" },
    { kind: "paragraph", key: "use" },

    { kind: "heading", key: "availabilityHeading" },
    { kind: "paragraph", key: "availability" },

    { kind: "heading", key: "liabilityHeading" },
    { kind: "paragraph", key: "liability" },

    { kind: "heading", key: "changesHeading" },
    { kind: "paragraph", key: "changes" },

    { kind: "heading", key: "contactHeading" },
    { kind: "paragraph", key: "contactBody", href: "mailto:support@carodo.app", labelKey: "emailLink" },
  ],
};
