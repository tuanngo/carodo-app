import type { LegalDocument } from "./legal-page";

/**
 * The privacy policy, in the app's two languages. Every statement follows what the iOS app does
 * (carodo-ios docs/privacy.md, "What leaves the device") and what the api stores; a change to
 * either changes this page and its date in the same change. Feature names are the app's own
 * (Settings.xcstrings).
 */
export const privacyDocument: LegalDocument = {
  copy: {
    en: {
      heading: "Privacy Policy",
      effective: "Last updated: November 15, 2026",
      shortHeading: "The short version",
      summary: "Carodo is a driving journal for iPhone, designed to keep your journal private by default:",
      short1:
        "Your drives are recorded and stored on your iPhone, with a copy in your own iCloud if backup is on. Our servers do not receive your routes.",
      short2: "There is no sign-in. Recording, the journal and Replay need no account.",
      short3: "No advertising, no analytics, no tracking. We do not sell your data.",
      short4: "The Feed is optional, and it shows how people drive, never where.",
      shortEnd: "The rest of this page explains what the app stores, what leaves your iPhone and where it goes.",
      emailLink: "support@carodo.app",

      deviceHeading: "1. What Carodo stores on your iPhone",
      locationLead: "Location and routes.",
      location:
        "Recording drives is what Carodo is for. While a drive is being recorded, the app collects your precise location, also in the background, so recording continues while the iPhone is locked or you use another app. This gives the route, distance and speed of the drive and where it started, stopped and ended. If you turn on Auto Mode and allow location “Always”, iOS can wake Carodo when you start driving, so the drive is recorded without opening the app. Carodo keeps location only as part of a drive; it does not keep a continuous history of where you are.",
      motionLead: "Motion.",
      motion:
        "With your permission, Carodo reads motion activity (driving, walking, standing still) and barometric pressure from your iPhone, to notice when a drive starts and ends and to show its elevation.",
      drivesLead: "Drives.",
      drives:
        "For each drive: when it started and ended, its duration, distance and speeds, the vehicle, the names of the places it started and ended, and any name or note you add.",
      garageLead: "Vehicles and places.",
      garage:
        "The vehicles you add with their odometer readings, fill-ups, charges and other logs you enter; the places you save, such as Home or Work; and, if you link one, the car audio or CarPlay connection that tells Carodo which car you are in.",
      deviceOnly:
        "All of this is stored in the app, on your iPhone. Recording, the journal and Replay need no account and no internet connection. We run no server that receives your routes or your location history.",

      icloudHeading: "2. iCloud",
      icloud:
        "If you are signed in to iCloud, Carodo backs up and syncs your vehicles, places and finished drives, routes included, to your private iCloud database through Apple’s CloudKit, so they follow you to a new iPhone. That copy is encrypted in your iCloud account and handled by Apple under Apple’s privacy policy; we cannot access it. In Settings you can turn Back Up to iCloud off, and Delete from iCloud removes the copy.",

      backupHeading: "3. Backup files",
      backup:
        "You can save your journal as a backup file, with a password if you want one, and restore it later. The file is kept wherever you choose, for example in Files. It is never sent to us.",

      appleHeading: "4. Third-party services",
      appleIntro:
        "Carodo uses no analytics provider and no advertising network. Only two third parties are involved: Apple and Cloudflare. The Apple features below ask Apple directly from your iPhone; these requests never pass through us.",
      appleMapsLead: "Apple Maps:",
      appleMaps:
        "to draw the map, to name the area where a drive starts and ends, to name a place you stopped at or the fuel stations and chargers near you, and to follow the road across a gap in the GPS signal. A request carries only the few points it needs, never the whole route.",
      appleIntelligenceLead: "Apple Intelligence:",
      appleIntelligence:
        "on an iPhone that supports it, the short summary of a drive is written on the device. Nothing is sent to a server.",
      appleWeatherLead: "Apple Weather:",
      appleWeather:
        "to check whether it rained during a drive. Only when Feed sharing is on, the app sends one request per drive, with the start location rounded to a roughly 11 km grid and the start time rounded to the hour.",
      applePolicyLead: "Apple also runs iCloud (section 2). Apple handles all of this under its own",
      applePolicyLink: "Privacy Policy",
      cloudflareLead: "Cloudflare:",
      cloudflare:
        "hosts this website and the Feed’s server. It processes your IP address to deliver them; we do not store it. See Cloudflare’s",

      feedHeading: "5. The Feed (optional)",
      feedJoin:
        "The Feed shows how people drive, never where. You can read it without joining. Joining takes only a username: no email address, no password, no sign-in. Nothing is published until you turn sharing on, and then only car drives that end from that moment on.",
      feedData:
        "For each drive you share, our server receives when it started, its duration and distance, whether it rained, the make and model of the car unless you hide it, and an abstract shape of the route. The shape is made on your iPhone: the start and end are cut off (at least 300 m, more near Home and Work), then it is rotated and rescaled, so it cannot be placed on a map. No coordinates, addresses or place names are sent, and other people see the time only as a part of the day.",
      feedIdentity:
        "You choose how others see your shared drives: as “Someone” (the default) or under your username, and you can change it at any time. Either way we link them to your account, so that you can remove them. If you react to a drive, the reaction is stored with your account.",
      feedLeaving:
        "Stop sharing removes your drives from the Feed. Deleting your account in the app removes your username, drives and reactions from the Feed at once, and erases what remains on the server within 30 days. A one-way hash of the username is kept for 90 days so that nobody else can take it over, then deleted.",
      feedService:
        "To keep the Feed working and to prevent abuse, we check that requests come from the genuine app (Apple’s App Attest) and count requests by type, result and country. We do not store IP addresses, and the server never works out where you are from your connection.",

      diagnosticsHeading: "6. Diagnostics and support",
      crash:
        "Carodo contains no third-party analytics or crash-reporting software. If you have turned on Share With App Developers in iOS Settings, Apple may give us anonymous crash reports.",
      diagnostics:
        "The app keeps a drive diagnostics log on your iPhone for up to 14 days. It records what happened (a start, a save, a permission change), never where. It leaves your iPhone only if you choose to share it.",
      email:
        "If you email us, we receive your address and what you write, and use them only to answer you. Send Feedback adds the app and iOS version to the message; you see the message before you send it.",

      notCollectedHeading: "7. What we do not collect",
      notCollected1: "Your name, email address or phone number (unless you email us)",
      notCollected2: "Your contacts, photos or health data",
      notCollected3: "Advertising identifiers",
      notCollected4: "Analytics about how you use the app, or your activity in other apps and websites",
      notSold: "We do not sell your data, and we do not share it with advertisers or data brokers.",

      websiteHeading: "8. This website",
      website:
        "carodo.app uses no analytics and no tracking cookies. When you switch languages, your browser remembers your choice using a cookie and local storage. Cloudflare hosts the website (section 4).",
      cloudflarePolicyLink: "Privacy Policy",

      deletionHeading: "9. Keeping and deleting your data",
      deletion:
        "Your drives stay on your iPhone until you delete them. You can delete a single drive, or everything at once with Erase data on this iPhone in Settings; deleting the app also removes its data from the iPhone. The copy in iCloud and your backup files are separate: remove them with Delete from iCloud and where you saved the files.",

      securityHeading: "10. Security",
      security:
        "Data on your iPhone is protected by iOS, the copy in iCloud is encrypted by Apple, and connections to our server use HTTPS. No system is perfectly secure, but we hold very little that could be exposed.",

      rightsHeading: "11. Your choices and rights",
      yourRights:
        "Your drive history is held by you, on your iPhone and in your iCloud, so you can view, back up, correct and delete it yourself in the app. You can change the Location and Motion permissions at any time in iOS Settings. If you joined the Feed, you stop sharing and delete your account yourself, in the app; nothing has to be requested from us. The privacy law where you live may give you further rights, such as a copy of what our server holds about your account. For that, write to",

      childrenHeading: "12. Children",
      children:
        "Carodo is a driving app and is not directed at children under 13. We do not knowingly collect data from children.",

      changesHeading: "13. Changes to this policy",
      changes:
        "We update this policy when Carodo’s features or the way it handles data change. The current version is always on this page, with the date at the top.",

      contactHeading: "14. Contact",
      contactBody: "For questions about this policy, email",

      title: "Privacy Policy — Carodo",
      description: "What Carodo stores on your iPhone, what leaves it and where it goes.",
    },
    vi: {
      heading: "Chính sách quyền riêng tư",
      effective: "Cập nhật lần cuối: 15/11/2026",
      shortHeading: "Tóm tắt",
      summary: "Carodo là nhật ký lái xe trên iPhone. Nhật ký của bạn được giữ riêng tư ngay từ đầu:",
      short1:
        "Chuyến đi được ghi và lưu trên iPhone, rồi sao lưu lên iCloud của bạn nếu bật sao lưu. Chúng tôi không nhận lộ trình của bạn trên máy chủ.",
      short2: "Không cần đăng nhập hay tạo tài khoản để ghi chuyến đi, xem nhật ký và dùng Phát lại.",
      short3: "Không quảng cáo, không phân tích hành vi, không theo dõi. Chúng tôi không bán dữ liệu của bạn.",
      short4:
        "Bạn tự chọn có chia sẻ lên Feed hay không. Feed cho thấy cách mọi người lái xe, không tiết lộ nơi họ đi.",
      shortEnd: "Dưới đây là thông tin về dữ liệu Carodo lưu trên iPhone, dữ liệu được gửi đi và bên nhận dữ liệu đó.",
      emailLink: "support@carodo.app",

      deviceHeading: "1. Carodo lưu gì trên iPhone của bạn",
      locationLead: "Vị trí và lộ trình.",
      location:
        "Khi ghi chuyến đi, Carodo thu thập vị trí chính xác để lưu lộ trình, quãng đường, tốc độ, điểm xuất phát, các điểm dừng và điểm đến. Ứng dụng tiếp tục ghi khi iPhone khoá màn hình hoặc bạn dùng ứng dụng khác. Nếu bật Auto Mode và cấp quyền truy cập vị trí “Luôn luôn”, iOS có thể cho Carodo chạy nền khi bạn bắt đầu lái, giúp ghi chuyến đi mà không cần mở ứng dụng. Carodo chỉ lưu vị trí trong chuyến đi, không lưu lịch sử vị trí liên tục ngoài chuyến đi.",
      motionLead: "Chuyển động.",
      motion:
        "Khi được bạn cho phép, Carodo sử dụng dữ liệu chuyển động từ iPhone để nhận biết bạn đang lái xe, đi bộ hay đứng yên, qua đó xác định lúc chuyến đi bắt đầu và kết thúc. Ứng dụng cũng sử dụng dữ liệu áp suất khí quyển để hiển thị độ cao trong chuyến đi.",
      drivesLead: "Chuyến đi.",
      drives:
        "Mỗi chuyến đi gồm thời điểm bắt đầu và kết thúc, thời gian di chuyển, quãng đường, tốc độ, xe đã dùng, tên điểm xuất phát và điểm đến, cùng tên chuyến đi hoặc ghi chú bạn thêm.",
      garageLead: "Xe và địa điểm.",
      garage:
        "Những chiếc xe bạn thêm cùng số công-tơ-mét, các lần đổ xăng, sạc và nhật ký khác bạn nhập; các địa điểm bạn lưu như Nhà hoặc Nơi làm việc; và kết nối âm thanh xe hoặc CarPlay giúp Carodo biết bạn đang ở xe nào, nếu bạn liên kết.",
      deviceOnly:
        "Tất cả được lưu trong ứng dụng, trên iPhone của bạn. Ghi chuyến, nhật ký và Phát lại không cần tài khoản hay kết nối Internet. Chúng tôi không vận hành máy chủ nào nhận lộ trình hoặc lịch sử vị trí của bạn.",

      icloudHeading: "2. iCloud",
      icloud:
        "Nếu bạn đã đăng nhập iCloud, Carodo sao lưu và đồng bộ xe, địa điểm và các chuyến đã hoàn tất, gồm cả lộ trình, vào cơ sở dữ liệu iCloud riêng của bạn qua CloudKit của Apple, để dữ liệu theo bạn sang iPhone mới. Bản sao này được mã hoá trong tài khoản iCloud của bạn và do Apple xử lý theo chính sách quyền riêng tư của Apple; chúng tôi không truy cập được. Trong Cài đặt, bạn có thể tắt Sao lưu lên iCloud hoặc xoá bản sao trên iCloud.",

      backupHeading: "3. Tệp sao lưu",
      backup:
        "Bạn có thể lưu nhật ký thành một tệp sao lưu, đặt mật khẩu nếu muốn, và khôi phục sau này. Tệp nằm ở nơi bạn chọn, ví dụ trong ứng dụng Tệp, và không bao giờ được gửi cho chúng tôi.",

      appleHeading: "4. Dịch vụ của bên thứ ba",
      appleIntro:
        "Carodo không dùng nhà cung cấp phân tích hay mạng quảng cáo nào. Chỉ có hai bên thứ ba: Apple và Cloudflare. Các tính năng Apple dưới đây gửi yêu cầu trực tiếp từ iPhone của bạn đến Apple; các yêu cầu này không đi qua chúng tôi.",
      appleMapsLead: "Apple Maps:",
      appleMaps:
        "hiển thị bản đồ; tra cứu tên khu vực xuất phát, điểm đến, điểm dừng, trạm xăng và trạm sạc gần bạn; nối lại lộ trình theo đường khi tín hiệu GPS bị gián đoạn. Mỗi yêu cầu chỉ gửi những điểm cần thiết, không gửi toàn bộ lộ trình.",
      appleIntelligenceLead: "Apple Intelligence:",
      appleIntelligence:
        "trên iPhone có hỗ trợ, đoạn tóm tắt chuyến đi được viết ngay trên thiết bị. Không có gì được gửi lên máy chủ.",
      appleWeatherLead: "Apple Weather:",
      appleWeather:
        "xác định chuyến đi có gặp mưa hay không. Chỉ khi bạn bật chia sẻ lên Feed, ứng dụng mới gửi một yêu cầu cho mỗi chuyến đi. Vị trí xuất phát được làm tròn theo ô khoảng 11 km, còn thời điểm xuất phát được làm tròn đến giờ.",
      applePolicyLead: "Apple cũng vận hành iCloud (mục 2). Apple xử lý tất cả những dữ liệu này theo",
      applePolicyLink: "Chính sách quyền riêng tư của Apple",
      cloudflareLead: "Cloudflare:",
      cloudflare:
        "cung cấp hạ tầng cho website này và máy chủ Feed. Cloudflare xử lý địa chỉ IP để bạn truy cập được các dịch vụ này; chúng tôi không lưu địa chỉ IP. Xem",

      feedHeading: "5. Feed (tuỳ chọn)",
      feedJoin:
        "Feed cho thấy cách mọi người lái xe, không tiết lộ nơi họ đi. Bạn có thể xem mà không cần tham gia. Để tham gia, bạn chỉ cần chọn tên người dùng, không cần email, mật khẩu hay đăng nhập. Chuyến đi chỉ được chia sẻ sau khi bạn bật chia sẻ, và chỉ áp dụng cho những chuyến ô tô kết thúc từ thời điểm đó.",
      feedData:
        "Với mỗi chuyến bạn chia sẻ, máy chủ của chúng tôi nhận: thời điểm bắt đầu, thời lượng, quãng đường, trời có mưa hay không, hãng và mẫu xe (trừ khi bạn ẩn), và một hình dạng trừu tượng của lộ trình. Hình này được tạo trên iPhone: cắt bỏ đoạn đầu và đoạn cuối (ít nhất 300 m, nhiều hơn khi gần Nhà và Nơi làm việc), rồi xoay và đổi tỉ lệ, nên không thể đặt lại lên bản đồ. Không có toạ độ, địa chỉ hay tên địa điểm nào được gửi, và người khác chỉ thấy thời gian ở mức buổi trong ngày.",
      feedIdentity:
        "Bạn chọn cách người khác thấy chuyến mình chia sẻ: dưới tên “Ai đó” (mặc định) hoặc dưới tên người dùng của bạn, và có thể đổi bất cứ lúc nào. Trong cả hai trường hợp, chúng tôi vẫn gắn chuyến với tài khoản của bạn để bạn có thể gỡ. Nếu bạn thả cảm xúc cho một chuyến, cảm xúc đó được lưu cùng tài khoản của bạn.",
      feedLeaving:
        "Dừng chia sẻ sẽ gỡ các chuyến của bạn khỏi Feed. Xoá tài khoản trong ứng dụng sẽ gỡ ngay tên người dùng, các chuyến và cảm xúc của bạn khỏi Feed, và xoá phần còn lại trên máy chủ trong vòng 30 ngày. Một mã băm một chiều của tên người dùng được giữ 90 ngày để không ai khác chiếm tên, rồi bị xoá.",
      feedService:
        "Để Feed hoạt động và ngăn lạm dụng, chúng tôi kiểm tra yêu cầu đến từ ứng dụng chính thức (App Attest của Apple) và đếm số yêu cầu theo loại, kết quả và quốc gia. Chúng tôi không lưu địa chỉ IP, và máy chủ không bao giờ suy ra vị trí của bạn từ kết nối.",

      diagnosticsHeading: "6. Chẩn đoán và hỗ trợ",
      crash:
        "Carodo không chứa phần mềm phân tích hay báo cáo lỗi của bên thứ ba. Nếu bạn đã bật Chia sẻ với nhà phát triển ứng dụng trong Cài đặt iOS, Apple có thể gửi cho chúng tôi báo cáo sự cố ẩn danh.",
      diagnostics:
        "Ứng dụng lưu nhật ký chẩn đoán quá trình ghi chuyến đi trên iPhone trong tối đa 14 ngày. Nhật ký này ghi nhận các sự kiện như bắt đầu ghi, lưu chuyến đi hoặc thay đổi quyền truy cập, không ghi vị trí. Nhật ký chỉ được gửi đi khi bạn chủ động chia sẻ.",
      email:
        "Nếu bạn gửi email, chúng tôi nhận địa chỉ email và nội dung thư để trả lời bạn. Khi chọn Gửi góp ý, ứng dụng điền sẵn phiên bản Carodo và iOS vào thư. Bạn có thể xem lại thư trước khi gửi.",

      notCollectedHeading: "7. Những gì chúng tôi không thu thập",
      notCollected1: "Họ tên, địa chỉ email hoặc số điện thoại của bạn (trừ khi bạn gửi email cho chúng tôi)",
      notCollected2: "Danh bạ, ảnh hoặc dữ liệu sức khoẻ",
      notCollected3: "Mã định danh quảng cáo",
      notCollected4: "Dữ liệu phân tích cách bạn dùng ứng dụng, hoặc hoạt động của bạn trên ứng dụng và website khác",
      notSold: "Chúng tôi không bán dữ liệu của bạn và không chia sẻ với bên quảng cáo hay môi giới dữ liệu.",

      websiteHeading: "8. Website này",
      website:
        "carodo.app không có công cụ phân tích và không dùng cookie theo dõi. Khi bạn đổi ngôn ngữ, trình duyệt ghi nhớ lựa chọn đó bằng cookie và bộ nhớ cục bộ. Website sử dụng hạ tầng Cloudflare (mục 4).",
      cloudflarePolicyLink: "Chính sách quyền riêng tư của Cloudflare",

      deletionHeading: "9. Lưu giữ và xoá dữ liệu",
      deletion:
        "Chuyến đi nằm trên iPhone cho đến khi bạn xoá. Bạn có thể xoá từng chuyến, hoặc xoá tất cả bằng Xoá dữ liệu trên iPhone trong Cài đặt; xoá ứng dụng cũng xoá dữ liệu của ứng dụng khỏi iPhone. Bản sao trên iCloud và các tệp sao lưu là riêng biệt: hãy xoá bản sao iCloud trong Cài đặt của Carodo và xoá tệp ở nơi bạn đã lưu.",

      securityHeading: "10. Bảo mật",
      security:
        "Dữ liệu trên iPhone được iOS bảo vệ, bản sao trên iCloud được Apple mã hoá, và kết nối đến máy chủ của chúng tôi dùng HTTPS. Không hệ thống nào an toàn tuyệt đối, nhưng chúng tôi giữ rất ít dữ liệu có thể bị lộ.",

      rightsHeading: "11. Lựa chọn và quyền của bạn",
      yourRights:
        "Lịch sử lái xe do chính bạn giữ, trên iPhone và trong iCloud của bạn, nên bạn có thể tự xem, sao lưu, sửa và xoá ngay trong ứng dụng. Bạn có thể đổi quyền Vị trí và Chuyển động bất cứ lúc nào trong Cài đặt iOS. Nếu bạn đã tham gia Feed, bạn tự dừng chia sẻ và xoá tài khoản ngay trong ứng dụng, không cần gửi yêu cầu cho chúng tôi. Luật về quyền riêng tư nơi bạn sống có thể cho bạn thêm quyền khác, chẳng hạn nhận bản sao dữ liệu máy chủ giữ về tài khoản của bạn. Khi đó, hãy viết cho",

      childrenHeading: "12. Trẻ em",
      children:
        "Carodo là ứng dụng dành cho người lái xe và không hướng đến trẻ em dưới 13 tuổi. Chúng tôi không cố ý thu thập dữ liệu của trẻ em.",

      changesHeading: "13. Thay đổi chính sách",
      changes:
        "Chúng tôi cập nhật chính sách này khi tính năng hoặc cách Carodo xử lý dữ liệu thay đổi. Bản hiện hành luôn ở trang này, kèm ngày cập nhật ở đầu trang.",

      contactHeading: "14. Liên hệ",
      contactBody: "Nếu có câu hỏi về chính sách này, bạn có thể gửi email đến",

      title: "Chính sách quyền riêng tư — Carodo",
      description: "Tìm hiểu dữ liệu Carodo lưu trên iPhone, dữ liệu được gửi đi và bên nhận dữ liệu đó.",
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

    { kind: "heading", key: "icloudHeading" },
    { kind: "paragraph", key: "icloud" },

    { kind: "heading", key: "backupHeading" },
    { kind: "paragraph", key: "backup" },

    { kind: "heading", key: "appleHeading" },
    { kind: "paragraph", key: "appleIntro" },
    { kind: "paragraph", key: "appleMaps", leadKey: "appleMapsLead" },
    { kind: "paragraph", key: "appleIntelligence", leadKey: "appleIntelligenceLead" },
    { kind: "paragraph", key: "appleWeather", leadKey: "appleWeatherLead" },
    {
      kind: "paragraph",
      key: "applePolicyLead",
      href: "https://www.apple.com/legal/privacy/",
      labelKey: "applePolicyLink",
    },
    {
      kind: "paragraph",
      key: "cloudflare",
      leadKey: "cloudflareLead",
      href: "https://www.cloudflare.com/privacypolicy/",
      labelKey: "cloudflarePolicyLink",
    },

    { kind: "heading", key: "feedHeading" },
    { kind: "paragraph", key: "feedJoin" },
    { kind: "paragraph", key: "feedData" },
    { kind: "paragraph", key: "feedIdentity" },
    { kind: "paragraph", key: "feedLeaving" },
    { kind: "paragraph", key: "feedService" },

    { kind: "heading", key: "diagnosticsHeading" },
    { kind: "paragraph", key: "crash" },
    { kind: "paragraph", key: "diagnostics" },
    { kind: "paragraph", key: "email" },

    { kind: "heading", key: "notCollectedHeading" },
    { kind: "list", key: "notCollected", items: ["notCollected1", "notCollected2", "notCollected3", "notCollected4"] },
    { kind: "paragraph", key: "notSold" },

    { kind: "heading", key: "websiteHeading" },
    { kind: "paragraph", key: "website" },

    { kind: "heading", key: "deletionHeading" },
    { kind: "paragraph", key: "deletion" },

    { kind: "heading", key: "securityHeading" },
    { kind: "paragraph", key: "security" },

    { kind: "heading", key: "rightsHeading" },
    { kind: "paragraph", key: "yourRights", href: "mailto:support@carodo.app", labelKey: "emailLink" },

    { kind: "heading", key: "childrenHeading" },
    { kind: "paragraph", key: "children" },

    { kind: "heading", key: "changesHeading" },
    { kind: "paragraph", key: "changes" },

    { kind: "heading", key: "contactHeading" },
    { kind: "paragraph", key: "contactBody", href: "mailto:support@carodo.app", labelKey: "emailLink" },
  ],
};
