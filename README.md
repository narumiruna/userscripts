# Userscripts

Userscript source code is written in TypeScript. The build produces plain JavaScript files for a userscript manager.

## Threads Saved Button

Source: [`src/threads-saved-button/`](src/threads-saved-button/)

Output: `dist/threads-saved-button.user.js`

The script adds a bookmark shortcut beside each post's three-dot menu on Threads. It supports dynamically loaded posts and page changes.

On each click, the script opens that post's native menu and selects its current save or unsave action. It does not call private APIs, read account credentials, or use privileged userscript permissions.

The icon is a neutral action button, not a saved-state indicator. The script does not cache saved state or claim that a dispatched action succeeded on the server. Check Threads for login requests and error messages.

### Build and install

1. Install dependencies and build:

   ```sh
   npm ci
   npm run build
   ```

2. Install a userscript manager, such as Tampermonkey or Violentmonkey.
3. Create a new script in the manager. Replace its contents with `dist/threads-saved-button.user.js` and save it.
4. Open or reload Threads while signed in. Use the bookmark button beside a post's three-dot menu.

The metadata matches `threads.com` and `threads.net`, with or without `www`. The script does not run in frames.

### Supported labels and safe failure

The script recognizes English, Traditional Chinese, and Simplified Chinese menu labels:
- More: `More`, `More options`, `更多`, `更多選項`, `更多选项`.
- Save or unsave: `Save`, `Unsave`, `Remove from saved`, `儲存`, `取消儲存`, `保存`, `取消保存`, `收藏`, `取消收藏`.

Other languages and Threads markup changes can prevent detection. If the save action is absent, disabled, or ambiguous, the script leaves the menu unchanged and shows a message. It does not select a different action as a fallback.

Only one shortcut operation runs at a time. An existing open menu blocks a new operation. Pointer or keyboard input, navigation, or a closed post menu cancels a pending operation.

### Validation status

Public Threads markup was inspected in isolated Chromium on 2026-11-02. On the 1280px desktop layout, shortcuts appeared beside native post menus without overlap or horizontal overflow. The 390px logged-out layout did not expose native post menus, so no shortcuts appeared there.

DOM tests cover injection, save/unsave dispatch, dynamic posts, cancellation, menu ownership, and safe failures. Bundle tests check the metadata, JavaScript syntax, and startup. Controlled Chromium fixtures at both widths also passed pointer and keyboard save/unsave checks; these fixtures do not verify Threads server behavior.

An authenticated Threads session and userscript-manager installation were not available during development. Before relying on the script, the account owner must:
1. Install the generated script and confirm that a shortcut appears beside a test post.
2. Click it, then open the native menu and confirm that `Save` changed to `Unsave`.
3. Reload Threads and confirm that the post remains saved.
4. Click the shortcut again and confirm that the post is no longer saved.
5. Check scrolling, client-side navigation, and the account's interface language. If using a narrow layout, also confirm that native post menus and shortcuts appear.

Authenticated menu markup, account-state persistence, and manager integration remain unverified until these checks pass. Do not treat the script as live-verified before that check.

## Development

```sh
npm test
npm run check
npm run build
npm run ci
```

`npm run ci` runs Biome, Vitest, the TypeScript build, and the userscript bundle build. The build test also runs the actual bundler and checks the resulting entry point in jsdom.

For a bundle-only rebuild:

```sh
npm run build:userscripts
```

This command does not run the TypeScript type check.

The original Node.js template example remains available through `npm start` after a full build.

### Existing dependency warnings

`npm audit` reports two advisories in existing development dependencies: `launch-editor` (high) and `shell-quote` (critical). Both warnings were present before this change. These packages are not included in the userscript bundle. Dependency security updates remain separate work.
