# Userscripts

Browser userscripts for Threads, Reddit, and PTT. Each script is a standalone `.user.js` file: the source is the installation file. No build or npm commands are required to install or run it.

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

[threads-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/threads-saved-button/threads-saved-button.user.js
[threads-country-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/threads-country-label/threads-country-label.user.js
[reddit-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/reddit-saved-button/reddit-saved-button.user.js
[ptt-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/ptt-auto-media/ptt-auto-media.user.js

Script names link to their source files. Installation and update URLs use the source files on `main`; those files must be published before the URLs work. For a local or unpublished version, create a script in your manager and replace its contents with the source.

If you installed the previous generated Threads script, reinstall from the source link so its download and update URLs use the source file.

## Saved buttons

The Threads and Reddit scripts place a bookmark button immediately after Share in each supported post's action row. Each click opens that post's native menu and selects its current Save or Unsave action. Both scripts handle dynamically loaded posts, replaced action rows, and detected client-side navigation.

### Bookmark state

- **Solid:** saved.
- **Outlined:** unsaved.
- **Dashed outline:** state unavailable, not necessarily unsaved. The label is `Save / unsave (state unavailable)`, with no `aria-pressed` value.

The scripts do not open menus automatically to discover saved state. Opening a native menu updates the observed state. Native and shortcut save/unsave clicks update all copies of the same post immediately, before server confirmation. Later page data or menu observations can correct the icon.

The icon does not confirm a successful server response. Check the site for login requests and errors. State stays in page memory and is cleared on detected navigation.

### Threads Saved Button

- **Sites:** HTTPS `threads.com` and `threads.net`, with or without `www`.
- **Placement:** requires an identifiable post timestamp, native More menu, and action row. Header and footer timestamps are supported. Ambiguous posts are skipped; the header is not used as a fallback.
- **Initial state:** explicit boolean `has_viewer_saved` values in inline page data, matched by post `code`. Missing, null, or non-boolean values remain unknown until valid page data or a native-menu observation supplies the state.

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

Show a small flag emoji and country name after a post or reply author, outside the native profile link. The value is the account location shared through Threads About This Profile, not nationality, citizenship, or a verified current physical location.

- **Sites:** the same HTTPS Threads hosts as Threads Saved Button. The native data source was verified on `www.threads.com`; other host variants are not independently verified.
- **Placement:** requires a bare username link before an identifiable post timestamp in a header without body content. Dynamically loaded posts, replies, and post-detail headers are supported. Ambiguous headers, body mentions, navigation, profile headings, search pages, and layouts that require crossing a post's action row are skipped.
- **Display:** known English and localized country names are normalized with `Intl.DisplayNames`. English, Traditional Chinese, and Simplified Chinese region names are recognized, together with names supported for the page's locale. An unmapped official value remains text without a guessed flag. If `Intl.DisplayNames` is unavailable, official text remains readable.
- **Flag fallback:** flags are emoji, not downloaded images or fonts. Some Windows browsers show regional letters instead; the country name is always retained. The flag is decorative for screen readers. The tooltip states `Threads 公開的帳號所在地，非國籍`.
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

## Privacy and permissions

All scripts use `@grant none` and `@noframes` and do not write to browser storage. Saved buttons and PTT Auto Media do not call private APIs or read account credentials. Saved buttons use page data and native controls, not direct API requests.

Threads Country Label uses the browser's existing session for same-origin profile and native About This Profile requests. It reads the page-provided `DTSGInitialData` and `LSD` anti-CSRF values only for these requests and reads `WebBloksVersioningID` for the native endpoint version. Authentication values are not logged, cached as results, persisted, or sent to other origins. The script does not export cookies, call third-party country services, collect analytics, or perform account writes.

PTT previews load content from media hosts under the browser's cookie and network rules. New images omit the `Referer` header; new YouTube frames send only the page origin. The script does not scrape linked pages. It upgrades HTTP media URLs to HTTPS and does not embed non-HTTP(S), credential-bearing, localhost, single-label, or literal-IP URLs.

## Validation status

Automated tests execute the exact installation source. Controlled Chromium checks covered bookmark placement and states, pointer and keyboard dispatch, media display, and basic playback without changing an account's saved posts.

Public Threads and Reddit markup was inspected. PTT browser checks used local article snapshots because live navigation required age confirmation. Signed-in save/unsave behavior, account-state persistence, live PTT playback, and userscript-manager integration remain unverified.

The Threads Country Label native source was verified read-only on 2026-11-02 in signed-in English and Traditional Chinese views. Native request target IDs matched the profile data; the country states were `United States` and `美國`. Same-origin profile-route ID lookup was also verified. Sanitized source samples are in `tests/fixtures/threads-country-label.json`; unavailable-country variants are synthetic, not evidence of a live hidden-country check.

Country label checks evaluated the exact installation source in Chromium at 1280 px and 390 px widths, in light and dark themes. Controlled pages covered delayed and unavailable results, long-value wrapping, text fallback without flags, visible-only scheduling, deduplication, request spacing, profile ID fallback, dynamic posts, native class replacement, unchanged profile-link clicks, client-side navigation, cleanup, and coexistence with Threads Saved Button. These checks did not use a userscript manager. Read-only source injection on signed-in profile and post-detail pages also showed labels for native account locations. No saved posts or account settings were changed.

### Country label external checks

1. **Account owner:** after automated and controlled browser checks pass, install the local source in Tampermonkey or Violentmonkey while signed in. Compare post and reply labels with native About This Profile values; check scrolling, navigation, unavailable countries, and coexistence with Threads Saved Button without changing saved posts. Userscript-manager execution and live unavailable-country behavior remain unverified until this check passes. Do not claim compatibility for those paths before verification. Use local installation until the source file is published on `main`.
2. **User:** review the controlled captures or local installation for spacing, wrapping, and readable country text on the actual browser and operating system, including systems without flag emoji. This is subjective visual acceptance, not an automated result. Unchecked operating systems and host variants must remain listed as unverified.

To complete live verification of the other scripts:

1. Install the scripts through a userscript manager.
2. On Threads and Reddit, check saved, unsaved, and unknown icons while signed in. Save and unsave a test post with the shortcut, then confirm the result in the native menu and after reload. Check that manual native actions also update the icon.
3. Check the saved buttons while scrolling, on post-detail pages, in narrow layouts, after client-side navigation, and in your interface language.
4. On PTT, complete age confirmation yourself if required. Check image display and video playback on live articles.

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
