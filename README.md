# Userscripts

Browser userscripts for Threads, Reddit, PTT, and YouTube. Each script is a standalone `.user.js` file: the source is the installation file. No build or npm commands are required to install or run it.

## Install

1. Install a userscript manager, such as Tampermonkey or Violentmonkey.
2. Open an **Install** link below, or paste its URL into the manager's URL installation field.
3. Review the script's metadata and install it.
4. Reload the target site. Sign in to use Threads Country Label and the Threads and Reddit saved buttons.

| Script                                                                           | Purpose                                                               | Install                            |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| [Threads Saved Button](src/threads-saved-button/threads-saved-button.user.js)    | Add a save/unsave button after Share on Threads posts.                | [Install][threads-install]         |
| [Threads Country Label](src/threads-country-label/threads-country-label.user.js) | Show public account locations beside Threads post and reply authors.  | [Install][threads-country-install] |
| [Reddit Saved Button](src/reddit-saved-button/reddit-saved-button.user.js)       | Add a save/unsave button after Share on Reddit posts.                 | [Install][reddit-install]          |
| [PTT Auto Media](src/ptt-auto-media/ptt-auto-media.user.js)                      | Display linked images and videos inline in PTT articles and comments. | [Install][ptt-install]             |
| [YouTube Live Rewind](src/youtube-live-rewind/youtube-live-rewind.user.js)       | Enable the native DVR timeline for supported active live streams.     | [Install][youtube-install]         |

[threads-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/threads-saved-button/threads-saved-button.user.js
[threads-country-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/threads-country-label/threads-country-label.user.js
[reddit-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/reddit-saved-button/reddit-saved-button.user.js
[ptt-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/ptt-auto-media/ptt-auto-media.user.js
[youtube-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/youtube-live-rewind/youtube-live-rewind.user.js

Script names link to their source files. Installation and update URLs use the source files on `main`; those files must be published before the URLs work. For a local or unpublished version, create a script in your manager and replace its contents with the source.

If you installed the previous generated Threads script, reinstall from the source link so its download and update URLs use the source file.

## Saved buttons

The Threads and Reddit scripts place a bookmark button immediately after Share in each supported post's action row. Each click opens that post's native menu and selects its current Save or Unsave action. Both scripts handle dynamically loaded posts, replaced action rows, and detected client-side navigation.

### Bookmark state

- **Solid:** saved.
- **Outlined:** unsaved.
- **Dashed outline:** state unavailable, not necessarily unsaved. The label is `Save / unsave (state unavailable)`, with no `aria-pressed` value.

The scripts do not open menus automatically to discover saved state. Opening a supported native menu updates the observed state. Native and shortcut save/unsave clicks update all copies of the same post immediately, before server confirmation. Later page data or menu observations can correct the icon.

The icon does not confirm a successful server response. Check the site for login requests and errors. State stays in page memory and is cleared on detected navigation.

### Threads Saved Button

- **Sites:** HTTPS `threads.com` and `threads.net`, with or without `www`.
- **Placement:** requires an identifiable post timestamp, native More menu, and action row. Header and footer timestamps are supported. Ambiguous posts are skipped; the header is not used as a fallback.
- **Initial state:** explicit boolean `has_viewer_saved` values in inline page data, matched by post `code`. Missing, null, or non-boolean values remain unknown until valid page data or an owned native-menu observation supplies the state.
- **Menu ownership:** the native trigger must have a unique `aria-controls` target: the menu itself, or a container with one visible menu. Missing targets, duplicate IDs, conflicting expanded owners, or multiple eligible menus prevent dispatch and menu-derived state updates. The script leaves unsupported menus unchanged and reports a timeout after 2.5 seconds. It never retries a Save or Unsave click automatically.
- **Share labels:** exact supported labels can be on the button, role-button, or SVG. Visible label text and translated labels are supported; numeric counts do not replace icon labels. Adjacent and quoted posts cannot supply another post's action row.
- **Updates:** relevant post, menu, and JSON mutations are batched for 50 milliseconds. Counter, caption, and script-owned UI changes do not cause full-page post scans. Portal menus, delayed labels, visibility changes, and replaced content remain supported.
- **Navigation and cleanup:** URL changes through `pushState`, `replaceState`, `popstate`, or `hashchange` clear state and cancel pending work without requiring a DOM mutation. Replaced action rows and retired shortcuts cannot continue an old operation. History methods must permit monitoring at startup; otherwise the script does not start. Cleanup removes listeners and restores only History methods still owned by the script.
- **Retention:** states for connected shortcuts stay in memory. After each batched update, at most 500 additional detached post states remain, using least-recently-used eviction. An evicted code returns as unknown until fresh evidence arrives. Unchanged, consumed JSON nodes do not restore evicted or route-cleared states.

Version 0.2.2 removes the sole-visible-menu fallback. Layouts without a valid `aria-controls` relation can no longer dispatch or supply menu-derived state, even if an earlier version acted on them. Other ownership relations remain unverified and are not guessed.

Layouts without a native post menu have no shortcut. The inspected narrow, logged-out layout did not expose these menus.

### Reddit Saved Button

- **Sites:** HTTPS `www.reddit.com` and `reddit.com`, using the current `shreddit-post` layout, including controls in open Shadow DOM.
- **Not supported:** `old.reddit.com`, legacy layouts, and comment save controls.
- **Initial state:** the native overflow component's `is-post-saved` attribute means saved. Its absence means unsaved only when `is-logged-in` is present; otherwise the state remains unknown.

Unchanged native attribute snapshots do not overwrite later observed state or transfer saved flags to a different post when Reddit reuses a menu node.

### Supported labels and safe failure

Both scripts recognize English, Traditional Chinese, and Simplified Chinese menu labels. Other languages or site markup changes can prevent detection.

- If post ownership or action-row placement is ambiguous, no shortcut is added.
- If Save or Unsave is missing, hidden, disabled, or ambiguous, the script leaves the menu unchanged and shows a message. It does not select another action as a fallback.
- Only one shortcut operation runs at a time. Close any open menu before using a shortcut.
- Pointer or keyboard input, navigation, a removed or changed post, or a closed native menu cancels a pending operation.

## Threads Country Label

Show a small inline SVG flag and country name after a post or reply author, outside the native profile link. The value is the account location shared through Threads About This Profile, not nationality, citizenship, or a verified current physical location.

- **Sites:** the same HTTPS Threads hosts as Threads Saved Button. The native data source was verified on `www.threads.com`; other host variants are not independently verified.
- **Placement:** requires a bare username link before an identifiable post timestamp in a header without body content. Dynamically loaded posts, replies, and post-detail headers are supported. Ambiguous headers, body mentions, navigation, profile headings, search pages, and layouts that require crossing a post's action row are skipped.
- **Display:** known English and localized country names are normalized with `Intl.DisplayNames`. English, Traditional Chinese, and Simplified Chinese region names are recognized, together with names supported for the page's locale. An unmapped official value remains text without a guessed flag. If `Intl.DisplayNames` is unavailable, official text remains readable.
- **Flags:** 3:2 SVG artwork for 249 supported countries and regions is embedded in the userscript. Flags do not use emoji fonts, external images, fonts, or CDN requests, so Windows does not need flag-emoji support. The country name is always retained. Flags are decorative for screen readers and are not focusable. The tooltip states `Threads 公開的帳號所在地，非國籍`.
- **Unknown:** `所在地未知` means loading, unavailable data, or lookup failure. It does not prove that an author hid their country. No country is inferred from names, biographies, language, or profile flags.

### Requests and state

The script binds usernames to numeric account IDs from page data. If the ID is missing, it reads the same-origin profile HTML and verifies the profile route before looking up the account. It then makes a read-only, authenticated request to the native About This Profile endpoint. This endpoint is undocumented and can change; it is not a supported public Meta API.

Only visible authors are scheduled through `IntersectionObserver`. If that browser API is unavailable, labels remain unknown and no lookup is made. Duplicate authors share results. At most one request runs at a time, with at least one second between request starts and a ten-second timeout per request.

Country results remain in page memory for ten minutes. Unavailable results and ordinary failures have a 60-second retry delay. The result and identity maps each hold at most 500 entries. Detected navigation or viewer changes clear page state and cancel pending work. Nothing is written to browser storage or shared across reloads.

Authentication failures, HTTP 429, redirects, native rejection errors, or a detected login challenge suspend network lookups until reload. Resolve the underlying problem before reloading. A suspended lookup does not confirm that a country is hidden. The script does not open native menus automatically or change account settings. Disable or uninstall this script and reload to remove its labels without affecting the saved-button script.

## PTT Auto Media

Open a PTT article to display supported media links inline. The script runs on HTTPS `www.ptt.cc` and `ptt.cc` article paths under `/bbs/*/M.*.html`. It does not accept PTT's age-confirmation form; complete that step yourself when required.

### Supported media

- **Direct images:** JPEG, PNG, GIF, WebP, AVIF, and BMP, including URLs with query strings.
- **Imgur:** single-image pages, direct images, MP4/WebM, and GIFV links converted to MP4. Albums and galleries remain links.
- **Twitter images:** `pbs.twimg.com/media/` URLs, including `?format=jpg` and size suffixes.
- **Direct videos:** MP4, WebM, OGV, and M4V. Playback depends on browser codec support.
- **YouTube:** watch, short-link, Shorts, live, and embed URLs with a video ID. Channel and playlist links remain links. New embeds use `youtube-nocookie.com`.

### Display and playback

Original links remain available. Existing PTT images and players are reused rather than duplicated. New comment previews appear after the complete comment row, so the author and timestamp stay on their original line. Repeated links in separate comments can each have a preview.

Images load lazily. New videos have native controls and request metadata; they do not autoplay or loop. Animated GIFs use normal browser animation. Media fits the article width; images and direct videos also fit within 85% of the viewport height.

The script handles added or changed links and replaced article content. Failed generated previews show an error and an original-link fallback. Removed files, host restrictions, unsupported codecs, or YouTube embedding restrictions can prevent display or playback. An iframe load event does not confirm video playback.

## YouTube Live Rewind

Use YouTube's native draggable DVR timeline on active live streams that disable rewind. The script does not add a separate slider or a rewind-button panel.

- **Site:** HTTPS `www.youtube.com`, using the desktop watch player. The script starts on all paths so navigation from the home page can receive patched player data. Mobile and embedded players are not supported.
- **Installation:** install the source in a userscript manager and fully reload YouTube. It must run at `document-start` in the page context, before the player reads its configuration. The metadata requests page-context execution for Tampermonkey and Violentmonkey.
- **Changes:** enable `isLiveDvrEnabled` for active live responses that do not already enable DVR. When an HLS/DASH manifest or direct audio and video URLs are available, disable server-driven playback settings and remove the server-ABR URL so seeks do not return to the live edge. Without a client-side source, keep the transport unchanged. Keep adaptive formats and their DVR limits. Normal videos, finished broadcasts, and already-enabled DVR responses stay unchanged.
- **Use:** move the pointer over the player and drag its existing timeline. The native controls remain available in fullscreen. Select YouTube's **Live** control to return to the live edge. If playback stalls, reload the page.
- **Limits:** the native DVR window and available server segments determine how far back playback can go. An enabled timeline does not prove that every earlier segment can load. The script does not record video, create missing segments, or extend the server's retention window. YouTube's internal response format can change.
- **Removal:** disable the script and reload YouTube to restore the original player setup.

## Privacy and permissions

All scripts use `@grant none` and `@noframes` and do not write to browser storage. Saved buttons and PTT Auto Media do not call private APIs or read account credentials. Saved buttons use page data and native controls, not direct API requests.

Threads Country Label uses the browser's existing session for same-origin profile and native About This Profile requests. It reads the page-provided `DTSGInitialData` and `LSD` anti-CSRF values only for these requests and reads `WebBloksVersioningID` for the native endpoint version. Authentication values are not logged, cached as results, persisted, or sent to other origins. The script does not export cookies, call third-party country services, collect analytics, or perform account writes.

PTT previews load content from media hosts under the browser's cookie and network rules. New images omit the `Referer` header; new YouTube frames send only the page origin. The script does not scrape linked pages. It upgrades HTTP media URLs to HTTPS and does not embed non-HTTP(S), credential-bearing, localhost, single-label, or literal-IP URLs.

YouTube Live Rewind changes player-response data in page memory. It does not make its own network requests, read credentials, or write to browser storage. YouTube's native player requests the selected media segments under the browser's normal network rules.

## Validation status

Automated tests execute the exact installation source. Controlled Chromium checks covered bookmark placement and states, pointer and keyboard dispatch, media display, and basic playback without changing an account's saved posts.

Public Threads and Reddit markup was inspected. PTT browser checks used local article snapshots because live navigation required age confirmation. Signed-in save/unsave behavior, account-state persistence, live PTT playback, and userscript-manager integration remain unverified.

Threads Saved Button 0.2.2 passed 160 controlled checks in headless Chromium 156.0.8078.4 at 1280 px and 390 px widths, in light and dark themes. The checks evaluated the exact installation source with synthetic local pages and mocked native actions. They covered pointer and keyboard activation, bookmark states and placement, explicit menu ownership, hidden and disabled actions, delayed labels, portal menus, dynamic posts, adjacent and quoted posts without menus, action-row and root replacement, route changes without DOM updates, cache eviction during node reuse, duplicate startup, and cleanup. No remote page requests or account writes occurred. The focused suite passed 153 tests; full CI passed 406 tests, formatting, lint, and types. Additional deterministic tests cover unrelated-mutation query counts, concurrent cache transitions, retained History wrappers, and native menu evidence after observed closure. These results do not establish userscript-manager or live signed-in compatibility.

The Threads Country Label native source was verified read-only on 2026-11-02 in signed-in English and Traditional Chinese views. Native request target IDs matched the profile data; the country states were `United States` and `美國`. Same-origin profile-route ID lookup was also verified. Sanitized source samples are in `tests/fixtures/threads-country-label.json`; unavailable-country variants are synthetic, not evidence of a live hidden-country check.

Country label checks evaluated the exact installation source in Chromium at 1280 px and 390 px widths, in light and dark themes. Controlled pages covered delayed and unavailable results, long-value wrapping, text fallback without flags, visible-only scheduling, deduplication, request spacing, profile ID fallback, dynamic posts, native class replacement, unchanged profile-link clicks, client-side navigation, cleanup, and coexistence with Threads Saved Button. These checks did not use a userscript manager. The initial implementation also displayed native account locations through read-only source injection on signed-in profile and post-detail pages. No saved posts or account settings were changed.

Version 0.1.1 replaces emoji with inline SVG flags. Controlled Chromium checks at the same four size/theme combinations confirmed visible 18 × 12 px SVG artwork with Arial text, no regional-indicator letters, no additional asset requests, and unchanged text fallback and cleanup. All 249 bundled SVGs are checked for valid view boxes, static shapes, and absence of active content, external references, shared IDs, and page CSS classes. This SVG update was not tested through signed-in source injection or a Windows-native userscript manager.

### Threads saved-button external check

1. **Account owner:** after agent checks pass, install the local source through Tampermonkey or Violentmonkey while signed in. Use a test post only after approving the account writes. Compare the shortcut with that post's native menu, save and unsave it, confirm the result in the native menu and after reload, then restore its initial state. Check scrolling, routes, keyboard activation, translated labels, and coexistence with Threads Country Label. Expected result: only the selected post changes and later native evidence matches the icon. Live ownership variants, server persistence, and manager-specific execution or History monitoring remain unverified until this check is recorded. Do not request credentials or MFA codes in chat. Do not add an unverified ownership fallback or claim these paths as live-verified; a release may claim only completed controlled checks. This external check does not block completion of agent implementation work.

### Country label external checks

1. **Account owner:** after automated and controlled browser checks pass, install the local source in Tampermonkey or Violentmonkey while signed in. Compare post and reply labels with native About This Profile values; check scrolling, navigation, unavailable countries, and coexistence with Threads Saved Button without changing saved posts. Userscript-manager execution and live unavailable-country behavior remain unverified until this check passes. Do not claim compatibility for those paths before verification. Use local installation until the source file is published on `main`.
2. **User:** review the controlled captures or local installation for spacing, wrapping, and readable country text on the actual browser and operating system, including native Windows browsers. This is subjective visual acceptance, not an automated result. Native Windows SVG rendering, userscript-manager execution of this version, and unchecked host variants must remain listed as unverified.

To complete live verification of the other scripts:

1. Install the scripts through a userscript manager.
2. On Threads and Reddit, check saved, unsaved, and unknown icons while signed in. Save and unsave a test post with the shortcut, then confirm the result in the native menu and after reload. Check that manual native actions also update the icon.
3. Check the saved buttons while scrolling, on post-detail pages, in narrow layouts, after client-side navigation, and in your interface language.
4. On PTT, complete age confirmation yourself if required. Check image display and video playback on live articles.

### YouTube Live Rewind checks

Version 0.1.0 passed 56 focused tests and the full 462-test suite, formatting, lint, and JavaScript types. Tests load the exact installation source and cover initial inline data, parsed navigation responses, direct audio/video fallback without a manifest, missing fallback sources, unchanged normal and native-DVR videos, parser behavior, descriptor ownership, duplicate startup, and cleanup.

On 2026-11-04, the exact source was injected before page load in headless Chromium 156.0.8078.4 at 1280 × 800 px. Public stream `XMUjdlrDVFs` was live with DVR disabled before injection. Native pointer dragging sought roughly one minute back, five minutes back in fullscreen, and to broadcast time zero. Playback time and decoded video frames increased after each seek. The native **Live** control returned to live playback. A separate search-result click preserved the document and verified patched player data, native timeline dragging, and continued playback after in-site navigation. These checks used native controls, not direct playback-position assignments or a replacement timeline.

The originally supplied stream, `vUFuPPevafo`, ended during testing. Its live timeline dragging was not verified. The successful checks on another stream do not prove that every stream or earlier segment is available.

**User check:** after automated checks pass, install the local source through Tampermonkey or Violentmonkey and fully reload an active DVR-disabled stream. Check native dragging, fullscreen, the **Live** control, and navigation to another live video. Expected result: the selected earlier section plays while the broadcast continues. Userscript-manager document-start and page-context execution, signed-in playback, and other browsers remain unverified until checked. Do not claim manager compatibility from source-injection checks alone. Use the local source until it is published on `main`.

## Development

```sh
npm ci
npm run ci
```

| Command             | Check                                                                             |
| ------------------- | --------------------------------------------------------------------------------- |
| `npm run check`     | Biome formatting and lint checks.                                                 |
| `npm run typecheck` | JavaScript and JSDoc types in `src/**/*.js`, using `jsconfig.json` with `noEmit`. |
| `npm test`          | Vitest and jsdom tests that load the installation source directly.                |
| `npm run ci`        | All three checks above, in order.                                                 |

Keep each independent userscript in its own directory under `src/`, with metadata and implementation in the same `.user.js` file. Use JSDoc for types that JavaScript cannot infer. TypeScript is a development-only checker and emits no files. Increase the script's `@version` when publishing an update.

This repository does not publish an npm package and has no build, start, or npm release command.

## License

[AGPL-3.0-only](LICENSE).

Threads Country Label embeds SVG artwork from [country-flag-icons 1.6.20](https://www.npmjs.com/package/country-flag-icons/v/1.6.20), under the MIT License. The installation source includes the full upstream copyright and permission notice. Upstream CSS classes are removed to prevent page-style collisions.
