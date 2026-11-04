# Threads Country Label

Show a small inline SVG flag and country name after a post or reply author, outside the native profile link. The value is the account location shared through Threads About This Profile, not nationality, citizenship, or a verified current physical location.

[Source](threads-country-label.user.js) · [Shared installation instructions](../../README.md#install).

Sign in to Threads to use the account-location lookup.

- **Sites:** HTTPS `threads.com` and `threads.net`, with or without `www`. The native data source was verified on `www.threads.com`; other host variants are not independently verified.
- **Placement:** requires a bare username link before an identifiable post timestamp in a header without body content. Dynamically loaded posts, replies, and post-detail headers are supported. Ambiguous headers, body mentions, navigation, profile headings, search pages, and layouts that require crossing a post's action row are skipped.
- **Display:** known English and localized country names are normalized with `Intl.DisplayNames`. English, Traditional Chinese, and Simplified Chinese region names are recognized, together with names supported for the page's locale. An unmapped official value remains text without a guessed flag. If `Intl.DisplayNames` is unavailable, official text remains readable.
- **Flags:** 3:2 SVG artwork for 249 supported countries and regions is embedded in the userscript. Flags do not use emoji fonts, external images, fonts, or CDN requests, so Windows does not need flag-emoji support. The country name is always retained. Flags are decorative for screen readers and are not focusable. The tooltip states `Threads 公開的帳號所在地，非國籍`.
- **Unknown:** `所在地未知` means loading, unavailable data, or lookup failure. It does not prove that an author hid their country. No country is inferred from names, biographies, language, or profile flags.

## Requests and state

The script binds usernames to numeric account IDs from page data. If the ID is missing, it reads the same-origin profile HTML and verifies the profile route before looking up the account. It then makes a read-only, authenticated request to the native About This Profile endpoint. This endpoint is undocumented and can change; it is not a supported public Meta API.

Only visible authors are scheduled through `IntersectionObserver`. If that browser API is unavailable, labels remain unknown and no lookup is made. Duplicate authors share results. At most one request runs at a time, with at least one second between request starts and a ten-second timeout per request.

Country results remain in page memory for ten minutes. Unavailable results and ordinary failures have a 60-second retry delay. The result and identity maps each hold at most 500 entries. Identity eviction prefers authors that are not visible or in an active lookup. If profile lookup restores an evicted identity, an unexpired country result is reused without extending its expiry. Detected navigation or viewer changes clear page state and cancel pending work. Nothing is written to browser storage or shared across reloads.

Unchanged JSON scripts reuse extracted authentication context. Request checks compare the current script text, so a viewer change is detected even before the mutation batch runs. Changed author and timestamp structures are reconciled locally. Caption, counter, and generated label updates do not cause full-feed header discovery. Visibility callbacks and lookup results reuse existing author bindings.

Authentication failures, HTTP 429, redirects, native rejection errors, or a detected login challenge suspend network lookups until reload. Resolve the underlying problem before reloading. A suspended lookup does not confirm that a country is hidden. The script does not open native menus automatically or change account settings. Disable or uninstall this script and reload to remove its labels without affecting the saved-button script.

## Privacy

Threads Country Label uses the browser's existing session for same-origin profile and native About This Profile requests. It reads the page-provided `DTSGInitialData` and `LSD` anti-CSRF values only for these requests and reads `WebBloksVersioningID` for the native endpoint version. Authentication values are not logged, cached as results, persisted, or sent to other origins. The script does not export cookies, call third-party country services, collect analytics, or perform account writes.

## Validation

The Threads Country Label native source was verified read-only on 2026-11-02 in signed-in English and Traditional Chinese views. Native request target IDs matched the profile data; the country states were `United States` and `美國`. Same-origin profile-route ID lookup was also verified. Sanitized source samples are in [`tests/fixtures/threads-country-label.json`](../../tests/fixtures/threads-country-label.json); unavailable-country variants are synthetic, not evidence of a live hidden-country check.

Country label checks evaluated the exact installation source in Chromium at 1280 px and 390 px widths, in light and dark themes. Controlled pages covered delayed and unavailable results, long-value wrapping, text fallback without flags, visible-only scheduling, deduplication, request spacing, profile ID fallback, dynamic posts, native class replacement, unchanged profile-link clicks, client-side navigation, cleanup, and coexistence with Threads Saved Button. These checks did not use a userscript manager. The initial implementation also displayed native account locations through read-only source injection on signed-in profile and post-detail pages. No saved posts or account settings were changed.

Version 0.1.1 replaces emoji with inline SVG flags. Controlled Chromium checks at the same four size/theme combinations confirmed visible 18 × 12 px SVG artwork with Arial text, no regional-indicator letters, no additional asset requests, and unchanged text fallback and cleanup. All 249 bundled SVGs are checked for valid view boxes, static shapes, and absence of active content, external references, shared IDs, and page CSS classes. This SVG update was not tested through signed-in source injection or a Windows-native userscript manager.

Performance regression tests execute the exact installation source in jsdom. They check unchanged-JSON parse counts, local header discovery, unrelated and generated UI mutations, incomplete-header recovery, identity eviction, cache expiry, immediate viewer changes, and cleanup. Operation counts do not establish live-browser frame times. These performance changes have not been checked on live Threads or through a userscript manager; the existing live and manager limits still apply.

## Manual checks

1. **Account owner:** after automated and controlled browser checks pass, install the local source in Tampermonkey or Violentmonkey while signed in. Compare post and reply labels with native About This Profile values; check scrolling, navigation, unavailable countries, and coexistence with Threads Saved Button without changing saved posts. Userscript-manager execution and live unavailable-country behavior remain unverified until this check passes. Do not claim compatibility for those paths before verification. Use local installation until the source file is published on `main`.
2. **User:** review the controlled captures or local installation for spacing, wrapping, and readable country text on the actual browser and operating system, including native Windows browsers. This is subjective visual acceptance, not an automated result. Native Windows SVG rendering, userscript-manager execution of this version, and unchecked host variants must remain listed as unverified.

## Credits

Threads Country Label embeds SVG artwork from [country-flag-icons 1.6.20](https://www.npmjs.com/package/country-flag-icons/v/1.6.20), under the MIT License. The installation source includes the full upstream copyright and permission notice. Upstream CSS classes are removed to prevent page-style collisions.
