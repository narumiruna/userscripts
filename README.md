# Userscripts

Each userscript is one JavaScript `.user.js` file with its own metadata. The source is the installation file. No compilation, bundling, or generated copy is required.

Use JSDoc for types that JavaScript cannot infer. TypeScript is a development-only JavaScript checker; it does not compile or emit files.

## Threads Saved Button

Source and installation file: [`src/threads-saved-button/threads-saved-button.user.js`](src/threads-saved-button/threads-saved-button.user.js)

Raw installation URL:

```text
https://raw.githubusercontent.com/narumiruna/userscripts/main/src/threads-saved-button/threads-saved-button.user.js
```

The URL becomes available after the JavaScript file is pushed to `main`. There is no separate release artifact.

### Install

1. Install a userscript manager, such as Tampermonkey or Violentmonkey.
2. Open the raw installation URL, or enter it in the manager's URL installation field.
3. Review the script's metadata and install it.
4. Open or reload Threads while signed in. Use the bookmark button after Share in a post's action row.

For a local installation before publication, create a new script in the manager and replace its contents with the source file. No npm commands are required to install or run the script.

If you installed the previous generated version, reinstall from the JavaScript source. Its `@downloadURL` and `@updateURL` point to the raw source URL.

### Behavior

The script adds a bookmark shortcut immediately after Share in each supported post's action row. It does not put a shortcut in the post header. It supports dynamically loaded posts and page changes. If the script cannot identify an unambiguous action row, it does not attach a button to another post or fall back to the header.

Post detection supports timestamp permalinks in the header or footer and additional DOM wrappers. Unrelated popup menus, such as edit history, are not counted as separate post menus. Detection stops before the page body or at an ambiguous post boundary; it does not assign the current page URL to every reply.

On each click, it opens that post's native menu and selects its current save or unsave action. It does not call private APIs, read account credentials, or use privileged userscript permissions.

The icon shows the state available to the script:
- A solid bookmark means saved.
- An outlined bookmark means unsaved.
- A dashed outline means the state is unavailable. Its label says `Save / unsave (state unavailable)`, and it has no `aria-pressed` value.

Initial state comes from explicit boolean `has_viewer_saved` fields in Threads' inline page data, matched by the post's `code`. Missing, null, or non-boolean values remain unknown. The script does not open menus automatically to discover state. Posts without an inline flag can remain unknown until their native menu is opened.

Native menu labels update the observed state. Save and unsave clicks update the icon optimistically, including duplicate copies of the same post. New page data or a later native-menu observation can correct that state. The icon is not confirmation of a successful server response; check Threads for login requests and errors.

State stays in page memory. It is cleared on detected navigation and is not written to browser storage. The script does not make API requests to read saved state.

The metadata matches `threads.com` and `threads.net`, with or without `www`. The script does not run in frames.

### Supported labels and safe failure

The script recognizes English, Traditional Chinese, and Simplified Chinese menu labels:
- More: `More`, `More options`, `更多`, `更多選項`, `更多选项`.
- Share: `Share`, `Share post`, `分享`, `分享貼文`, `分享帖子`.
- Save or unsave: `Save`, `Unsave`, `Remove from saved`, `儲存`, `取消儲存`, `保存`, `取消保存`, `收藏`, `取消收藏`.

Other languages and Threads markup changes can prevent detection. If the save action is absent, disabled, or ambiguous, the script leaves the menu unchanged and shows a message. It does not select a different action as a fallback.

Only one shortcut operation runs at a time. An existing open menu blocks a new operation. Pointer or keyboard input, navigation, or a closed post menu cancels a pending operation.

### Validation status

Public Threads markup was inspected in isolated Chromium on 2026-11-02. The updated script placed shortcuts after Share in the 1280px desktop layout without overlap or horizontal overflow. The action row has separate native control wrappers, and inline JSON contains post `code` and `has_viewer_saved` fields. The flag is null when logged out; this is not evidence of an unsaved post. The narrow logged-out layout did not expose native post menus, so no shortcuts appeared there.

Public post-detail checks do not reproduce a signed-in layout. Footer-timestamp, extra-popup, and deep-wrapper regression fixtures reproduced a missing main-post shortcut in version 0.2.0; the corrected detection shows the main post and reply shortcuts without mixing their menus.

The JavaScript tests execute the exact installation source. They cover metadata, classic-script syntax, isolated startup, header/footer timestamps, extra wrappers and popups, main-post/reply ownership, action-row placement, initial and unknown states, native-menu observations, duplicate posts, recycled nodes, dispatch, cancellation, and safe failures. Controlled Chromium fixtures verify placement, solid and outlined icons, and pointer and keyboard dispatch without changing an account's saved posts.

An authenticated Threads session and userscript-manager installation are still required to verify account behavior. Before relying on the script, the account owner must:
1. Install the source script and confirm that the shortcut appears immediately after Share, not in the header.
2. Check a saved and an unsaved test post. Confirm solid and outlined icons when inline state is available; otherwise open the native menu and confirm that the icon updates.
3. Save the unsaved post with the shortcut. Confirm a solid icon and `Unsave` in the native menu, then reload and confirm that the post remains saved.
4. Unsave it with the shortcut. Confirm an outlined icon, check the native menu, and verify that manual native save/unsave actions also update the shortcut.
5. Check scrolling, client-side navigation, post-detail pages, and the account's interface language. If using a narrow layout, also confirm that native post menus and shortcuts appear. If a signed-in detail page still lacks a shortcut, provide a redacted screenshot or DOM sample of its timestamp, More control, and action row.

Authenticated boolean page flags, menu markup, account-state persistence, and manager integration remain unverified until these checks pass. Do not treat the script as live-verified before that check.

## Reddit Saved Button

Source and installation file: [`src/reddit-saved-button/reddit-saved-button.user.js`](src/reddit-saved-button/reddit-saved-button.user.js)

Raw installation URL:

```text
https://raw.githubusercontent.com/narumiruna/userscripts/main/src/reddit-saved-button/reddit-saved-button.user.js
```

The URL becomes available after the source file is pushed to `main`. Before publication, create a new script in Tampermonkey or Violentmonkey and replace its contents with the source file. No build or npm commands are required for installation.

### Install and use

1. Install the source script in a userscript manager.
2. Open or reload Reddit while signed in.
3. Use the bookmark button immediately after Share in a post's action row to save or unsave that post.

### Behavior

The script supports the current `shreddit-post` layout on `www.reddit.com` and `reddit.com`, including action rows and menus in open Shadow DOM. It handles dynamically loaded posts, replaced action rows, and detected client-side navigation. It does not support `old.reddit.com`, legacy layouts, or comment save controls. It does not run in frames.

Each click opens that post's native overflow menu and selects its current Save or Unsave action. The script does not call private APIs, read account credentials, use privileged userscript permissions, or write to browser storage. It does not open menus automatically to discover saved state.

The bookmark uses the same states as the Threads version:
- A solid bookmark means saved.
- An outlined bookmark means unsaved.
- A dashed outline means the state is unavailable. Its label says `Save / unsave (state unavailable)`, and it has no `aria-pressed` value.

Initial state comes from the native overflow component's Boolean attributes. An `is-post-saved` attribute means saved. Its absence means unsaved only when `is-logged-in` is present; otherwise the state remains unknown. Unchanged attribute snapshots do not overwrite a shortcut's later observed state. Recycled menu nodes do not transfer unchanged flags to a new post; changed flags can establish its state.

Opening the native menu updates the observed state. Native and shortcut save/unsave clicks update all copies of the same post optimistically. A later native-menu observation or changed attributes can correct that state. The icon is not confirmation of a successful server response; check Reddit for login requests and errors. State stays in page memory and is cleared on detected navigation.

Save labels supported: `Save`, `Unsave`, `Remove from saved`, `儲存`, `取消儲存`, `保存`, `取消保存`, `收藏`, and `取消收藏`. Other languages or Reddit markup changes can prevent detection. If the action row or post ownership is ambiguous, no shortcut is added. If the save action is missing, hidden, disabled, or ambiguous, the script leaves the menu unchanged and shows a message. It does not select another action as a fallback.

Only one shortcut operation runs at a time. An existing open menu blocks a new operation. Pointer or keyboard input, navigation, a disconnected or changed post, or a closed native menu cancels a pending operation.

### Validation status

Public Reddit markup was inspected in isolated Chromium on 2026-11-02. The script placed bookmarks after Share on subreddit feeds and post-detail pages at 1280px desktop and 390px mobile viewports. Styles applied inside each post's shadow root, and the checked action rows had no overlap or horizontal overflow. Logged-out menus contained only Award and Report; clicking the shortcut left the state unknown and reported that Save was unavailable. No account save actions were selected.

Tests execute the exact installation source and cover metadata, classic-script startup, Shadow DOM placement and events, native saved flags, native save/unsave dispatch, duplicate posts, recycled nodes, dynamic rendering, cancellation, safe failures, and cleanup. Controlled Chromium fixtures also verified solid and outlined icons and native dispatch through pointer clicks, Enter, and Space without changing an account's saved posts.

Authenticated account behavior and userscript-manager integration remain unverified. Before relying on the script, the account owner must install it while signed in, save and unsave a test post, and confirm the result in the native menu and after reload. Also check scrolling, post-detail pages, narrow layouts, client-side navigation, and the account's interface language. Do not treat the script as authenticated-live-verified before these checks pass.

## PTT Auto Media

Source and installation file: [`src/ptt-auto-media/ptt-auto-media.user.js`](src/ptt-auto-media/ptt-auto-media.user.js)

Raw installation URL:

```text
https://raw.githubusercontent.com/narumiruna/userscripts/main/src/ptt-auto-media/ptt-auto-media.user.js
```

The URL becomes available after the source file is pushed to `main`. Before publication, create a new script in Tampermonkey or Violentmonkey and replace its contents with the source file. No build or npm commands are required.

### Behavior

Open a PTT article to display supported media links inline. The script runs on HTTPS `www.ptt.cc` and `ptt.cc` article paths under `/bbs/*/M.*.html`, but not in frames. It does not accept PTT's age-confirmation form; complete that step yourself when required.

Supported media:
- Direct images: JPEG, PNG, GIF, WebP, AVIF, and BMP, including query strings.
- Imgur: single-image page links such as `https://imgur.com/MiX2PsS`, direct images, MP4/WebM, and GIFV links converted to MP4. Albums and gallery pages remain links.
- Twitter images: `pbs.twimg.com/media/` URLs, including `?format=jpg` and size suffixes.
- Direct videos: MP4, WebM, OGV, and M4V. Playback depends on the browser's codec support.
- YouTube: watch, short-link, Shorts, live, and embed URLs with a video ID. Channel and playlist links remain links. New embeds use `youtube-nocookie.com`.

Original links remain available. Existing PTT images and players are reused rather than duplicated, including native embeds after push comments. New comment previews appear after the complete push row, so the author and timestamp remain on their original line. Repeated links in separate comments can each have a preview.

Images load lazily. New video elements show native controls, request metadata, and do not autoplay or loop. Animated GIFs use the browser's normal image animation. Media sizes fit the article width; images and direct videos also fit within 85% of the viewport height.

The script handles added or changed links and replaced article content. Failed generated previews show an error and an original-link fallback. Removed files, host restrictions, unsupported codecs, or YouTube embedding restrictions can still prevent display or playback. An iframe load event does not confirm video playback.

The script does not scrape linked pages, call private APIs, use privileged userscript permissions, or store state. Loading media contacts its host under the browser's cookie and network rules. New images omit the Referer header; new YouTube frames send only the page origin because YouTube requires a Referer. HTTP media URLs are upgraded to HTTPS. Non-HTTP(S), credential-bearing, localhost, single-label, and literal-IP URLs are not embedded.

### Validation status

All four supplied article URLs returned HTML over HTTP requests on 2026-11-02. Live Chromium navigation required PTT's age-confirmation form, which was not accepted. Browser tests therefore used local HTML snapshots from those exact URLs, with the original base URL and native media retained and page scripts removed.

| Article                                                                     | New previews | Images decoded in Chromium | Existing YouTube players |
| --------------------------------------------------------------------------- | -----------: | -------------------------: | -----------------------: |
| [M.1671615390.A.16F](https://www.ptt.cc/bbs/Beauty/M.1671615390.A.16F.html) |            0 |                      6 / 6 |                        0 |
| [M.1763884187.A.A75](https://www.ptt.cc/bbs/Beauty/M.1763884187.A.A75.html) |           13 |                    13 / 13 |                        0 |
| [M.1767883809.A.A3D](https://www.ptt.cc/bbs/Beauty/M.1767883809.A.A3D.html) |            7 |                    14 / 14 |                        1 |
| [M.1793540689.A.F4E](https://www.ptt.cc/bbs/Beauty/M.1793540689.A.F4E.html) |           11 |                    11 / 11 |                        0 |

All 44 images decoded at both 1280px desktop and 390px mobile viewports. No checked image or player extended beyond the article width. The third article's native comment image and YouTube player were not duplicated.

Controlled Chromium checks also verified that a direct MP4 remained paused until playback was requested, then advanced its playback time. A generated YouTube player loaded the supplied video's title and Play control with the origin-only referrer policy. These checks do not establish live PTT playback or userscript-manager integration.

The tests execute the exact installation source. Sanitized fixtures retain only source URLs, push placement, and native media URLs from the four articles. Tests cover URL conversion, metadata, native embed reuse, comment placement, lazy images, video controls, dynamic changes, error handling, and cleanup.

Before relying on the script, install it in a userscript manager, complete PTT's age confirmation yourself if required, and check image display and video playback on the live articles. Live-site manager integration and playback remain unverified until those checks pass.

## Development

```sh
npm ci
npm run ci
```

The CI command runs:
1. `npm run check`: Biome formatting and lint checks.
2. `npm run typecheck`: JavaScript and JSDoc checking for `src/**/*.js` through `jsconfig.json`, with `noEmit`.
3. `npm test`: Vitest and jsdom tests that load the installation source directly, without a build.

Keep each independent userscript in its own directory under `src/`. Keep its metadata and implementation in the same `.user.js` file. Increase its `@version` when publishing an updated script.

This repository does not publish an npm package. It has no `build`, `start`, or npm release command.
