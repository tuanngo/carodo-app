import type { LegalDocument } from "./legal-page";

/**
 * The privacy policy, in the app's two languages. Every statement follows what the iOS app does
 * today (carodo-ios docs/privacy.md for behaviour; describe only what ships) and what the api
 * stores. A change to either changes this page and its date in the same change. Feature names are
 * the app's own (Settings.xcstrings). No share links: sharing is images and videos made on device.
 * Short sections with bold leads on paragraphs (`leadKey`).
 */
export const privacyDocument: LegalDocument = {
  copy: {
    en: {
      heading: "Privacy Policy",
      effective: "Last updated: November 18, 2026",
      shortHeading: "The short version",
      summary: "Carodo is a driving journal for iPhone. It is private by default:",
      short1: "Your drives live on your iPhone, with a copy in your own iCloud if backup is on.",
      short2: "No account needed for Recording, Journeys, Replay or share images and videos.",
      short3: "No ads and no third-party analytics SDKs. We do not sell your data.",
      short4:
        "The Feed is optional (how people drive, never where). Share cards and Replay videos are made on your iPhone. Privacy Zone hides the start and end of the route.",
      shortEnd: "The rest of this page explains what the app stores, what leaves your iPhone and where it goes.",
      emailLink: "support@carodo.app",

      deviceHeading: "1. What Carodo stores on your iPhone",
      locationLead: "Location and routes.",
      location:
        "While a drive records, Carodo collects precise location in the background so the route, distance, speed, start, stops and end are saved. With Auto Mode and location “Always”, iOS can wake Carodo when you start driving. Location is kept only as part of a drive, not as a continuous history of where you are.",
      motionLead: "Motion.",
      motion:
        "With your permission, Carodo reads motion activity and barometric pressure to notice when a drive starts and ends and to show elevation.",
      drivesLead: "Drives.",
      drives:
        "For each drive: times, duration, distance, speeds, the vehicle, place names for start and end, and any name or note you add.",
      garageLead: "Vehicles and places.",
      garage:
        "Your vehicles, odometer and fuel or charge logs, saved places such as Home or Work, and optional CarPlay or Bluetooth links so Carodo knows which car you are in.",
      deviceOnly:
        "All of this stays in the app on your iPhone. Recording and the journal work offline and without an account. None of it is sent to our servers unless you use an optional feature in section 5.",

      backupsHeading: "2. How your data is stored",
      icloudLead: "iCloud.",
      icloud:
        "If backup is on, finished drives (routes included), vehicles and places sync to your private CloudKit database. That copy is encrypted in your iCloud account under Apple’s privacy policy; we cannot access it. Turn Back Up to iCloud off or Delete from iCloud in Settings.",
      backupFileLead: "Backup files.",
      backupFile:
        "You can save a password-protected backup wherever you choose (for example Files). That file is never sent to us.",

      shareHeading: "3. Share cards and Privacy Zone",
      shareCards:
        "You can export a share card image or a Replay video of a drive. They are generated on your device and are only shared when you choose to share them. With your permission, they can be saved to your photo library. Carodo does not upload them to our servers, and does not read your photo library.",
      privacyZoneLead: "Privacy Zone.",
      privacyZone:
        "Privacy Zone trims the beginning and end of your route on share cards, Replay videos and Feed shapes, so the exact locations where your drives start and end (such as your home) are not revealed when you share. It is 300 m by default; you can change it in Settings. A drive that starts or ends at a private place such as Home or Work hides that place too. Full routes always stay in the app.",

      thirdHeading: "4. Third-party services",
      thirdIntro:
        "Carodo does not use advertising networks or third-party analytics SDKs. The only third parties involved are Apple and Cloudflare. Requests to Apple leave your iPhone directly; they do not pass through our servers. See Apple’s",
      applePolicyLink: "Privacy Policy",
      thirdMapsLead: "Apple Maps.",
      thirdMaps: "Map tiles, place names and filling GPS gaps. Only the points needed are sent, never the whole route.",
      thirdWeatherLead: "Apple Weather.",
      thirdWeather:
        "Rain for a drive, only when Feed sharing is on. The app sends Apple a coarse start location (~11 km) and hour; that position does not go to our servers.",
      thirdIntelligenceLead: "Apple Intelligence.",
      thirdIntelligence: "Optional short drive summary written on the device. Nothing is sent to a Carodo server.",
      thirdIcloudLead: "Apple iCloud / CloudKit.",
      thirdIcloud: "Private backup when you turn it on (section 2).",
      thirdCloudflareLead: "Cloudflare.",
      thirdCloudflare:
        "Hosts this website and our API servers for the optional Feed and related public data. See Cloudflare’s",
      cloudflarePolicyLink: "Privacy Policy",

      feedHeading: "5. The Feed (optional)",
      feedJoin:
        "The Feed shows how people drive, never where. You can read it without joining. A username is enough (no email or password). Nothing is published until you turn sharing on, then only new car drives. You can appear as “Someone” or under your username.",
      feedData:
        "For each shared drive we keep duration, distance, rain, the car unless you hide it, a coarse time of day, and an abstract route shape made on your iPhone with Privacy Zone applied, then rotated so it cannot be mapped. No coordinates or place names. Stop sharing or delete your account in the app to remove Feed data; we erase the rest within 30 days. App Attest and coarse request counts help run the Feed and limit abuse. We do not store IP addresses or infer your location from the connection.",

      supportHeading: "6. Diagnostics and support",
      crashLead: "Crash reports.",
      crash:
        "There is no third-party crash SDK. If Share With App Developers is on in iOS Settings, Apple may give us anonymous crash reports.",
      diagnosticsLead: "Diagnostics.",
      diagnostics:
        "A log on your iPhone (up to 14 days) records events such as starts and permission changes, never where. It leaves the device only if you share it.",
      emailLead: "Email.",
      email:
        "If you email us, we use your address and message only to reply. Send Feedback can add the app and iOS version; you see the message before you send.",

      notCollectedHeading: "7. What we do not collect",
      notCollected1: "Name, email or phone (unless you email us)",
      notCollected2: "Contacts, health data, or photos other than ones you choose to save",
      notCollected3: "Advertising identifiers",
      notCollected4: "Tracking you across other apps and websites",
      notSold: "We do not sell your data or share it with advertisers or data brokers.",

      controlHeading: "8. Data retention and deletion",
      control:
        "Delete drives in the app, or erase all data on this iPhone in Settings. Deleting the app removes local data; remove iCloud and backup files separately. Feed data is removed when you stop sharing or delete your account (section 5). Device data is protected by iOS; iCloud by Apple; our connections use HTTPS. You control Location and Motion in iOS Settings. Privacy law where you live may give further rights over what our server holds; for that, write to",

      childrenHeading: "9. Children’s privacy",
      children: "Carodo is a driving app and is not directed at children under 13. We do not knowingly collect their data.",

      changesHeading: "10. Changes to this policy",
      changes:
        "We update this privacy policy when data handling changes because of new features or legal requirements. When we do, we update the “Last updated” date at the top of this page.",

      contactHeading: "11. Contact",
      contactBody: "Questions about this policy:",

      title: "Privacy Policy · Carodo",
      description:
        "Carodo’s privacy policy: what the app stores on your iPhone, what leaves the device, and where it goes. Private by default; no account needed to record.",
    },
    vi: {
      heading: "Chính sách quyền riêng tư",
      effective: "Cập nhật lần cuối: 18/11/2026",
      shortHeading: "Tóm tắt",
      summary: "Carodo là nhật ký lái xe trên iPhone. Nhật ký của bạn được giữ riêng tư ngay từ đầu:",
      short1: "Chuyến đi nằm trên iPhone, sao lưu lên iCloud của bạn nếu bật.",
      short2: "Ghi chuyến, Hành trình, Phát lại và ảnh hoặc video chia sẻ không cần tài khoản.",
      short3: "Không quảng cáo và không SDK phân tích của bên thứ ba. Chúng tôi không bán dữ liệu của bạn.",
      short4:
        "Feed là tuỳ chọn (cách mọi người lái, không phải nơi họ đi). Ảnh thẻ và video Phát lại tạo trên iPhone. Vùng riêng tư ẩn đoạn đầu và cuối lộ trình.",
      shortEnd: "Phần còn lại của trang giải thích dữ liệu ứng dụng lưu, dữ liệu rời iPhone và nơi dữ liệu đó đi.",
      emailLink: "support@carodo.app",

      deviceHeading: "1. Carodo lưu gì trên iPhone của bạn",
      locationLead: "Vị trí và lộ trình.",
      location:
        "Khi đang ghi chuyến, Carodo thu thập vị trí chính xác cả khi chạy nền để lưu lộ trình, quãng đường, tốc độ, điểm xuất phát, điểm dừng và điểm đến. Với Auto Mode và quyền vị trí “Luôn luôn”, iOS có thể đánh thức Carodo khi bạn bắt đầu lái. Vị trí chỉ được giữ trong chuyến đi, không phải lịch sử vị trí liên tục.",
      motionLead: "Chuyển động.",
      motion:
        "Khi được phép, Carodo đọc hoạt động chuyển động và áp suất khí quyển để nhận biết lúc chuyến bắt đầu và kết thúc và hiện độ cao.",
      drivesLead: "Chuyến đi.",
      drives:
        "Mỗi chuyến: thời gian, thời lượng, quãng đường, tốc độ, xe, tên điểm đầu–cuối, và tên hoặc ghi chú bạn thêm.",
      garageLead: "Xe và địa điểm.",
      garage:
        "Xe của bạn, công-tơ-mét và nhật ký xăng hoặc sạc, địa điểm như Nhà hoặc Nơi làm việc, và liên kết CarPlay hoặc Bluetooth nếu có để biết bạn đang ở xe nào.",
      deviceOnly:
        "Tất cả nằm trong ứng dụng trên iPhone. Ghi chuyến và nhật ký hoạt động offline, không cần tài khoản. Không gửi lên máy chủ của chúng tôi trừ khi bạn dùng tính năng tuỳ chọn ở mục 5.",

      backupsHeading: "2. Dữ liệu được lưu như thế nào",
      icloudLead: "iCloud.",
      icloud:
        "Nếu bật sao lưu, chuyến đã xong (kèm lộ trình), xe và địa điểm đồng bộ vào cơ sở dữ liệu CloudKit riêng của bạn. Bản sao được mã hoá trong tài khoản iCloud theo chính sách của Apple; chúng tôi không truy cập được. Tắt Sao lưu lên iCloud hoặc Xoá khỏi iCloud trong Cài đặt.",
      backupFileLead: "Tệp sao lưu.",
      backupFile:
        "Bạn có thể lưu tệp sao lưu có mật khẩu ở nơi bạn chọn (ví dụ Tệp). Tệp đó không bao giờ được gửi cho chúng tôi.",

      shareHeading: "3. Ảnh thẻ chia sẻ và Vùng riêng tư",
      shareCards:
        "Bạn có thể xuất ảnh thẻ chia sẻ hoặc video Phát lại của một chuyến. Chúng được tạo trên thiết bị và chỉ được chia sẻ khi bạn chọn chia sẻ. Với sự cho phép của bạn, chúng có thể lưu vào thư viện ảnh. Carodo không tải chúng lên máy chủ và không đọc thư viện ảnh của bạn.",
      privacyZoneLead: "Vùng riêng tư.",
      privacyZone:
        "Vùng riêng tư cắt đoạn đầu và cuối lộ trình trên ảnh thẻ, video Phát lại và hình dạng Feed, để vị trí xuất phát và đến chính xác (ví dụ nhà bạn) không lộ khi chia sẻ. Mặc định 300 m; bạn có thể đổi trong Cài đặt. Chuyến bắt đầu hoặc kết thúc ở địa điểm riêng tư như Nhà hoặc Nơi làm việc cũng được ẩn địa điểm đó. Lộ trình đầy đủ luôn nằm trong ứng dụng.",

      thirdHeading: "4. Dịch vụ bên thứ ba",
      thirdIntro:
        "Carodo không dùng mạng quảng cáo hay SDK phân tích của bên thứ ba. Chỉ có Apple và Cloudflare. Yêu cầu tới Apple đi thẳng từ iPhone, không qua máy chủ của chúng tôi. Xem",
      applePolicyLink: "Chính sách quyền riêng tư của Apple",
      thirdMapsLead: "Apple Maps.",
      thirdMaps: "Bản đồ, tên địa điểm và nối khoảng trống GPS. Chỉ gửi các điểm cần thiết, không gửi cả lộ trình.",
      thirdWeatherLead: "Apple Weather.",
      thirdWeather:
        "Mưa trong chuyến, chỉ khi bật chia sẻ Feed. Ứng dụng gửi Apple vị trí xuất phát thô (~11 km) và giờ; vị trí đó không tới máy chủ của chúng tôi.",
      thirdIntelligenceLead: "Apple Intelligence.",
      thirdIntelligence: "Tóm tắt chuyến tuỳ chọn viết trên thiết bị. Không gửi lên máy chủ Carodo.",
      thirdIcloudLead: "Apple iCloud / CloudKit.",
      thirdIcloud: "Sao lưu riêng khi bạn bật (mục 2).",
      thirdCloudflareLead: "Cloudflare.",
      thirdCloudflare: "Host website này và máy chủ API của chúng tôi cho Feed tuỳ chọn và dữ liệu công khai liên quan. Xem",
      cloudflarePolicyLink: "Chính sách quyền riêng tư của Cloudflare",

      feedHeading: "5. Feed (tuỳ chọn)",
      feedJoin:
        "Feed cho thấy cách mọi người lái xe, không tiết lộ nơi họ đi. Bạn có thể xem mà không tham gia. Chỉ cần tên người dùng (không email hay mật khẩu). Chỉ chia sẻ sau khi bạn bật, và chỉ chuyến ô tô mới. Bạn có thể hiện là “Ai đó” hoặc dưới tên người dùng.",
      feedData:
        "Với mỗi chuyến đã chia sẻ chúng tôi giữ thời lượng, quãng đường, mưa, xe (trừ khi ẩn), thời gian ở mức buổi trong ngày, và hình lộ trình trừu tượng tạo trên iPhone với Vùng riêng tư, rồi xoay để không đặt lại lên bản đồ. Không toạ độ hay tên địa điểm. Dừng chia sẻ hoặc xoá tài khoản trong ứng dụng để gỡ dữ liệu Feed; phần còn lại xoá trong 30 ngày. App Attest và đếm yêu cầu thô giúp vận hành Feed và hạn chế lạm dụng. Chúng tôi không lưu IP và không suy ra vị trí từ kết nối.",

      supportHeading: "6. Chẩn đoán và hỗ trợ",
      crashLead: "Báo cáo sự cố.",
      crash:
        "Không có SDK báo lỗi bên thứ ba. Nếu bật Chia sẻ với nhà phát triển ứng dụng trong Cài đặt iOS, Apple có thể gửi báo cáo sự cố ẩn danh.",
      diagnosticsLead: "Chẩn đoán.",
      diagnostics:
        "Nhật ký trên iPhone (tối đa 14 ngày) ghi sự kiện như bắt đầu ghi và đổi quyền, không ghi vị trí. Chỉ rời máy nếu bạn chia sẻ.",
      emailLead: "Email.",
      email:
        "Nếu bạn email, chúng tôi dùng địa chỉ và nội dung chỉ để trả lời. Gửi góp ý có thể thêm phiên bản app và iOS; bạn xem thư trước khi gửi.",

      notCollectedHeading: "7. Những gì chúng tôi không thu thập",
      notCollected1: "Họ tên, email hoặc số điện thoại (trừ khi bạn gửi email)",
      notCollected2: "Danh bạ, dữ liệu sức khoẻ, hoặc ảnh ngoài những gì bạn tự chọn lưu",
      notCollected3: "Mã định danh quảng cáo",
      notCollected4: "Theo dõi bạn trên các app và website khác",
      notSold: "Chúng tôi không bán dữ liệu và không chia sẻ với quảng cáo hay môi giới dữ liệu.",

      controlHeading: "8. Lưu giữ và xoá dữ liệu",
      control:
        "Xoá chuyến trong app, hoặc xoá toàn bộ dữ liệu trên iPhone trong Cài đặt. Xoá app gỡ dữ liệu cục bộ; iCloud và tệp sao lưu phải xoá riêng. Dữ liệu Feed gỡ khi dừng chia sẻ hoặc xoá tài khoản (mục 5). Dữ liệu trên máy được iOS bảo vệ; iCloud bởi Apple; kết nối của chúng tôi dùng HTTPS. Bạn đổi quyền Vị trí và Chuyển động trong Cài đặt iOS. Luật nơi bạn sống có thể cho thêm quyền về dữ liệu trên máy chủ; khi đó hãy viết cho",

      childrenHeading: "9. Quyền riêng tư của trẻ em",
      children:
        "Carodo là ứng dụng dành cho người lái xe và không hướng đến trẻ em dưới 13 tuổi. Chúng tôi không cố ý thu thập dữ liệu của trẻ em.",

      changesHeading: "10. Thay đổi chính sách này",
      changes:
        "Chúng tôi cập nhật chính sách này khi cách xử lý dữ liệu đổi vì tính năng mới hoặc yêu cầu pháp lý. Khi đó chúng tôi cập nhật ngày “Cập nhật lần cuối” ở đầu trang.",

      contactHeading: "11. Liên hệ",
      contactBody: "Câu hỏi về chính sách này:",

      title: "Chính sách quyền riêng tư · Carodo",
      description:
        "Chính sách quyền riêng tư của Carodo: dữ liệu lưu trên iPhone, dữ liệu rời máy và nơi nó đi. Riêng tư ngay từ đầu; ghi chuyến không cần tài khoản.",
    },
  },
  blocks: [
    { kind: "heading", key: "shortHeading" },
    { kind: "paragraph", key: "summary" },
    { kind: "list", key: "short", items: ["short1", "short2", "short3", "short4"] },
    { kind: "paragraph", key: "shortEnd" },

    { kind: "heading", key: "deviceHeading" },
    { kind: "paragraph", key: "location", leadKey: "locationLead" },
    { kind: "paragraph", key: "motion", leadKey: "motionLead" },
    { kind: "paragraph", key: "drives", leadKey: "drivesLead" },
    { kind: "paragraph", key: "garage", leadKey: "garageLead" },
    { kind: "paragraph", key: "deviceOnly" },

    { kind: "heading", key: "backupsHeading" },
    { kind: "paragraph", key: "icloud", leadKey: "icloudLead" },
    { kind: "paragraph", key: "backupFile", leadKey: "backupFileLead" },

    { kind: "heading", key: "shareHeading" },
    { kind: "paragraph", key: "shareCards" },
    { kind: "paragraph", key: "privacyZone", leadKey: "privacyZoneLead" },

    { kind: "heading", key: "thirdHeading" },
    {
      kind: "paragraph",
      key: "thirdIntro",
      href: "https://www.apple.com/legal/privacy/",
      labelKey: "applePolicyLink",
    },
    { kind: "paragraph", key: "thirdMaps", leadKey: "thirdMapsLead" },
    { kind: "paragraph", key: "thirdWeather", leadKey: "thirdWeatherLead" },
    { kind: "paragraph", key: "thirdIntelligence", leadKey: "thirdIntelligenceLead" },
    { kind: "paragraph", key: "thirdIcloud", leadKey: "thirdIcloudLead" },
    {
      kind: "paragraph",
      key: "thirdCloudflare",
      leadKey: "thirdCloudflareLead",
      href: "https://www.cloudflare.com/privacypolicy/",
      labelKey: "cloudflarePolicyLink",
    },

    { kind: "heading", key: "feedHeading" },
    { kind: "paragraph", key: "feedJoin" },
    { kind: "paragraph", key: "feedData" },

    { kind: "heading", key: "supportHeading" },
    { kind: "paragraph", key: "crash", leadKey: "crashLead" },
    { kind: "paragraph", key: "diagnostics", leadKey: "diagnosticsLead" },
    { kind: "paragraph", key: "email", leadKey: "emailLead" },

    { kind: "heading", key: "notCollectedHeading" },
    { kind: "list", key: "notCollected", items: ["notCollected1", "notCollected2", "notCollected3", "notCollected4"] },
    { kind: "paragraph", key: "notSold" },

    { kind: "heading", key: "controlHeading" },
    { kind: "paragraph", key: "control", href: "mailto:support@carodo.app", labelKey: "emailLink" },

    { kind: "heading", key: "childrenHeading" },
    { kind: "paragraph", key: "children" },

    { kind: "heading", key: "changesHeading" },
    { kind: "paragraph", key: "changes" },

    { kind: "heading", key: "contactHeading" },
    { kind: "paragraph", key: "contactBody", href: "mailto:support@carodo.app", labelKey: "emailLink" },
  ],
};
