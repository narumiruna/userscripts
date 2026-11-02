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
4. Open or reload Threads while signed in. Use the bookmark button beside a post's three-dot menu.

For a local installation before publication, create a new script in the manager and replace its contents with the source file. No npm commands are required to install or run the script.

If you installed the previous generated version, reinstall from the JavaScript source. Its `@downloadURL` and `@updateURL` point to the raw source URL.

### Behavior

The script adds a bookmark shortcut beside each post's three-dot menu. It supports dynamically loaded posts and page changes.

On each click, it opens that post's native menu and selects its current save or unsave action. It does not call private APIs, read account credentials, or use privileged userscript permissions.

The icon is a neutral action button, not a saved-state indicator. The script does not cache saved state or claim that a dispatched action succeeded on the server. Check Threads for login requests and error messages.

The metadata matches `threads.com` and `threads.net`, with or without `www`. The script does not run in frames.

### Supported labels and safe failure

The script recognizes English, Traditional Chinese, and Simplified Chinese menu labels:
- More: `More`, `More options`, `更多`, `更多選項`, `更多选项`.
- Save or unsave: `Save`, `Unsave`, `Remove from saved`, `儲存`, `取消儲存`, `保存`, `取消保存`, `收藏`, `取消收藏`.

Other languages and Threads markup changes can prevent detection. If the save action is absent, disabled, or ambiguous, the script leaves the menu unchanged and shows a message. It does not select a different action as a fallback.

Only one shortcut operation runs at a time. An existing open menu blocks a new operation. Pointer or keyboard input, navigation, or a closed post menu cancels a pending operation.

### Validation status

The prior implementation's public Threads markup was inspected in isolated Chromium on 2026-11-02. On the 1280px desktop layout, shortcuts appeared beside native post menus without overlap or horizontal overflow. The 390px logged-out layout did not expose native post menus, so no shortcuts appeared there.

The JavaScript tests execute the exact installation source. They cover metadata, classic-script syntax, isolated startup, dynamic posts, save/unsave dispatch, cancellation, menu ownership, and safe failures. Controlled Chromium fixtures verify pointer and keyboard dispatch without changing an account's saved posts.

An authenticated Threads session and userscript-manager installation are still required to verify account behavior. Before relying on the script, the account owner must:
1. Install the source script and confirm that a shortcut appears beside a test post.
2. Click it, then open the native menu and confirm that `Save` changed to `Unsave`.
3. Reload Threads and confirm that the post remains saved.
4. Click the shortcut again and confirm that the post is no longer saved.
5. Check scrolling, client-side navigation, and the account's interface language. If using a narrow layout, also confirm that native post menus and shortcuts appear.

Authenticated menu markup, account-state persistence, and manager integration remain unverified until these checks pass. Do not treat the script as live-verified before that check.

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
