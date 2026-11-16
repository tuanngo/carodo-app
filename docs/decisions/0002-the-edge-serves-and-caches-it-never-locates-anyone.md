# ADR 0002: The edge serves and caches; it never locates anyone

- Status: Accepted (2026-11-03)
- Context: every request reaching a Worker carries `request.cf`: the caller's country, and an
  IP-based city, region, postal code, time zone and coordinates. It is tempting for the Feed
  ("driving in Ho Chi Minh City"), but it says where the phone is when it calls, not where the
  drive was (drives are often published later, from home Wi-Fi), mobile carriers in Vietnam
  geolocate to Hanoi or Ho Chi Minh City, a VPN moves it anywhere, and it would make the server
  locate people, which carodo-ios ADR 0007 and 0010 rule out.
- Decision:
  - **Never located by the server.** No city, region, postal code, time zone or coordinates from
    `request.cf` are read for content, stored, or logged. A drive's area exists only when the
    person turns on "Show my area" and the device sends it (`DriveArea`, carodo-ios ADR 0007).
  - **Country, per request only:** `request.cf.country` may apply a rule that differs by country
    and feed per-country counters in Analytics Engine. It is never stored on an account or a drive.
  - **What the network is for:** share pages and their preview images cached at the edge (Workers
    Cache with ETags), so a link opens fast anywhere; avatars and card images in R2 behind the
    cache; Feed and leaderboard reads from D1 read replicas near the reader when traffic needs it
    (writes stay with the primary); rate limits through the Rate Limiting binding;
    WAF rules on the public web page. The app itself is proven by App Attest, not by a captcha.
- Reason: the privacy promise holds without exceptions, and the global network still makes the
  Feed and share links fast for readers in every country.
- Consequence:
  - Logs (structured JSON) never include `request.cf` beyond `colo` and `country`.
  - A feature that wants a location asks the device for a coarse value it computed, through the
    contract, with the owner's approval; it never reads one from the request. Feed V1 has none
    (carodo-ios ADR 0007): `accounts.region_code` stays in the schema, unused, for the Nearby and
    country feeds that may come back with their own decision.
