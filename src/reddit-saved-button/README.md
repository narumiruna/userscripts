# Reddit Saved Button

The script places a bookmark button immediately after Share in each supported post's action row. Each click opens that post's native menu and selects its current Save or Unsave action. The script handles dynamically loaded posts, replaced action rows, and detected client-side navigation.

[Source](reddit-saved-button.user.js) · [Shared installation instructions](../../README.md#install).

## Installation

Follow the shared installation instructions and sign in to Reddit before using the saved button.

## Bookmark state

- **Solid:** saved.
- **Outlined:** unsaved.
- **Dashed outline:** state unavailable, not necessarily unsaved. The label is `Save / unsave (state unavailable)`, with no `aria-pressed` value.

The script does not open menus automatically to discover saved state. Opening a supported native menu updates the observed state. Native and shortcut save/unsave clicks update all copies of the same post immediately, before server confirmation. Later page data or menu observations can correct the icon.

The icon does not confirm a successful server response. Check the site for login requests and errors. State stays in page memory and is cleared on detected navigation.

## Sites and state

- **Sites:** HTTPS `www.reddit.com` and `reddit.com`, using the current `shreddit-post` layout, including controls in open Shadow DOM.
- **Not supported:** `old.reddit.com`, legacy layouts, and comment save controls.
- **Initial state:** the native overflow component's `is-post-saved` attribute means saved. Its absence means unsaved only when `is-logged-in` is present; otherwise the state remains unknown.

Unchanged native attribute snapshots do not overwrite later observed state or transfer saved flags to a different post when Reddit reuses a menu node.

## Updates and performance

Mutation updates are batched for 50 ms. Added and removed subtrees are searched locally for posts. Relevant control, ID, flag, and visibility changes recheck only the affected posts. Class, style, and other visibility attributes inside a post also recheck that post, because descendant selectors such as `:has()` can control its row visibility. Unrelated counter text and script-owned UI writes do not trigger post scans or layout reads. Label changes in an open native menu remain observed.

Initialization, navigation signals, resize, page stylesheet DOM changes, and post/menu custom-element definitions can recheck the whole page. The script handles row and ancestor visibility changes, slotted rows, root rerenders, and removed bookmarks or shadow styles. CSSOM-only changes can require a resize or navigation signal.

## Supported labels and safe failure

The script recognizes English, Traditional Chinese, and Simplified Chinese menu labels. Other languages or site markup changes can prevent detection.

- If post ownership or action-row placement is ambiguous, no shortcut is added.
- If Save or Unsave is missing, hidden, disabled, or ambiguous, the script leaves the menu unchanged and shows a message. It does not select another action as a fallback.
- Only one shortcut operation runs at a time. Close any open menu before using a shortcut.
- Pointer or keyboard input, navigation, a removed or changed post, or a closed native menu cancels a pending operation.

## Privacy

This script does not call private APIs, read account credentials, or write to browser storage. It uses page data and native controls, not direct API requests. Observed bookmark state stays in page memory and is cleared on detected navigation.

## Validation

Automated tests execute the exact installation source. Operation-count tests use 100-post fixtures: unrelated mutations cause no document/post scans, row geometry checks, or computed-style reads. One-post changes do not query or read layout in the other 99 posts. Tests also cover local discovery and removal, navigation resets, visibility, native menu updates, root rerenders, shadow roots, delayed element definitions, and cancellation.

Public Reddit markup was inspected. Earlier controlled Chromium checks covered bookmark placement and states and pointer and keyboard dispatch without changing an account's saved posts. The performance changes have not been checked in Chromium or on live Reddit. Operation counts do not establish live-browser frame times. Signed-in save/unsave behavior, account-state persistence, and userscript-manager integration remain unverified.

## Manual checks

1. **Account owner:** after automated and controlled checks pass, install the local source through a userscript manager while signed in. Check saved, unsaved, and unknown icons. Use a test post only after approving the account writes.
2. Save and unsave the test post with the shortcut. Confirm each result in the native menu and after reload, then restore its initial state. Check that manual native actions also update the icon.
3. Check scrolling, post-detail pages, narrow layouts, client-side navigation, and your interface language. Expected result: only the selected post changes and later native evidence matches the icon. Userscript-manager execution and server persistence remain unverified until these checks pass.
