# Threads Saved Button

The script places a bookmark button immediately after Share in each supported post's action row. One click saves an unsaved post or unsaves a saved post. It opens that post's native menu and automatically selects Save or Unsave; no second click is required. The native menu can appear briefly. The script handles dynamically loaded posts, replaced action rows, and detected client-side navigation.

[Source](threads-saved-button.user.js) · [Shared installation instructions](../../README.md#install).

## Installation

Follow the shared installation instructions and sign in to Threads before using the saved button.

If you installed the previous generated Threads script, reinstall from the source link so its download and update URLs use the source file.

## Bookmark state

- **Solid:** saved.
- **Outlined:** unsaved.
- **Dashed outline:** state unavailable, not necessarily unsaved. The label is `Save / unsave (state unavailable)`, with no `aria-pressed` value.

The script does not open menus automatically to discover saved state. Opening a supported native menu updates the observed state. Native and shortcut save/unsave clicks update all copies of the same post immediately, before server confirmation. Later page data or menu observations can correct the icon.

The icon does not confirm a successful server response. Check the site for login requests and errors. State stays in page memory and is cleared on detected navigation.

## Sites and placement

- **Sites:** HTTPS `threads.com` and `threads.net`, with or without `www`.
- **Placement:** requires an identifiable post timestamp, native More menu, and action row. Header and footer timestamps are supported. Ambiguous posts are skipped; the header is not used as a fallback.
- **Initial state:** explicit boolean `has_viewer_saved` values in inline page data, matched by post `code`. Missing, null, or non-boolean values remain unknown until valid page data or an owned native-menu observation supplies the state.
- **Menu ownership:** an explicit `aria-controls` relation must identify one menu, directly or through a container. Missing targets, duplicate IDs, and conflicting expanded owners prevent dispatch. If the trigger has no `aria-controls`, a shortcut click can use one newly created visible menu only when that trigger is the only expanded menu control. Menus present before the click, including hidden menus, cannot supply this fallback. The selected fallback menu cannot change during the operation. Once an explicit relation is present or changes, the operation cannot return to fallback mode. Passive native-menu state updates still require explicit ownership. Unsupported menus stay unchanged and time out after 2.5 seconds. The script never retries a Save or Unsave click automatically.
- **Share labels:** exact supported labels can be on the button, role-button, or SVG. Visible label text and translated labels are supported; numeric counts do not replace icon labels. Ownership checks require one timestamp path and one More control in the selected scope.
- **Unsupported initial layout:** if a post lacks both its timestamp and action row beside a post without More, initial discovery can attach a shortcut to the neighboring row. Do not use the shortcut on that layout. This pre-existing limit is unchanged by the pending-recovery performance fix.
- **Updates:** relevant post, menu, and JSON mutations are batched for 50 milliseconds. Pending post controls recover locally when timestamps, action rows, or Share labels arrive, including after reparenting. Appended posts do not make pending controls query the shared feed. Navigation More controls are excluded from pending recovery. Counter, caption, and script-owned UI changes do not cause full-page post scans. Portal menus, delayed labels, visibility changes, and replaced content remain supported.
- **Navigation and cleanup:** URL changes through `pushState`, `replaceState`, `popstate`, or `hashchange` clear state and cancel pending work without requiring a DOM mutation. Replaced action rows and retired shortcuts cannot continue an old operation. History methods must permit monitoring at startup; otherwise the script does not start. Cleanup removes listeners and restores only History methods still owned by the script.
- **Retention:** states for connected shortcuts stay in memory. After each batched update, at most 500 additional detached post states remain, using least-recently-used eviction. An evicted code returns as unknown until fresh evidence arrives. Unchanged, consumed JSON nodes do not restore evicted or route-cleared states.

Version 0.2.4 handles the inspected Threads portal layout without menu IDs or `aria-controls` during a shortcut click. It does not restore the global sole-visible-menu fallback. Existing or ambiguous unlinked menus remain unsupported, and passive observations still require explicit ownership.

Layouts without a native post menu have no shortcut. The inspected narrow, logged-out layout did not expose these menus.

## Supported labels and safe failure

The script recognizes English, Traditional Chinese, and Simplified Chinese menu labels. Other languages or site markup changes can prevent detection.

- If post ownership or action-row placement is ambiguous, no shortcut is added.
- If Save or Unsave is missing, hidden, disabled, or ambiguous, the script leaves the menu unchanged and shows a message. It does not select another action as a fallback.
- Only one shortcut operation runs at a time. Close any open menu before using a shortcut.
- Pointer or keyboard input, navigation, a removed or changed post, or a closed native menu cancels a pending operation.

## Privacy

This script does not call private APIs, read account credentials, or write to browser storage. It uses page data and native controls, not direct API requests. Observed bookmark state stays in page memory and is cleared on detected navigation.

## Validation

The live More menu on a public Threads post was inspected. Its trigger had no `aria-controls`, and its portal had no menu ID. No Save or Unsave action was selected during this inspection. Live save/unsave behavior, account-state persistence, and userscript-manager integration remain unverified.

Before the waiting-trigger change, Threads Saved Button 0.2.2 passed 160 controlled checks in headless Chromium 156.0.8078.4 at 1280 px and 390 px widths, in light and dark themes. The checks evaluated the exact installation source with synthetic local pages and mocked native actions. They covered pointer and keyboard activation, bookmark states and placement, explicit menu ownership, hidden and disabled actions, delayed labels, portal menus, dynamic posts, adjacent and quoted posts without menus, action-row and root replacement, route changes without DOM updates, cache eviction during node reuse, duplicate startup, and cleanup. No remote page requests or account writes occurred. The focused suite passed 153 tests; full CI passed 406 tests, formatting, lint, and types. Additional deterministic tests cover unrelated-mutation query counts, concurrent cache transitions, retained History wrappers, and native menu evidence after observed closure. These results do not establish userscript-manager or live signed-in compatibility.

The waiting-trigger change passed 166 focused exact-source tests in jsdom, repository typecheck, and formatting/lint checks for the changed paths. A fixture with 100 supported posts, one outer post with a quoted post, and five separately appended supported posts made 5 shared-feed queries matching 525 timestamp links before the change; it makes zero shared-feed queries afterward. Navigation and incomplete More triggers also cause zero shared-feed queries on append. Tests cover local incomplete-post recovery, reparented triggers and posts, adjacent and quoted timestamps without More menus, and changed or removed timestamps. The Chromium checks were not repeated for this change. Live signed-in behavior and userscript-manager limits remain unchanged and unverified.

Version 0.2.4 passed 186 focused tests and four installation-source checks. Full CI passed 542 tests, formatting, lint, and types. Ten controlled checks passed in Chromium 156 at a 1440 × 1003 viewport with the exact installation source on a synthetic page. They covered one-click Save and Unsave, Traditional Chinese Unsave, delayed menus and labels, existing and ambiguous menus, replaced portals, invalid or removed explicit ownership, and ownership changes queued in native microtasks. These controlled checks made no remote page requests or account writes. Live save/unsave persistence and userscript-manager execution remain unverified.

## Manual check

1. **Account owner:** after agent checks pass, install the local source through Tampermonkey or Violentmonkey while signed in. Use a test post only after approving the account writes. Compare the shortcut with that post's native menu, save and unsave it, confirm the result in the native menu and after reload, then restore its initial state. Check scrolling, routes, keyboard activation, translated labels, and coexistence with Threads Country Label. Expected result: only the selected post changes and later native evidence matches the icon. Live ownership variants, server persistence, and manager-specific execution or History monitoring remain unverified until this check is recorded. Do not request credentials or MFA codes in chat. Do not extend menu inference beyond the documented checks or claim these paths as live-verified; a release may claim only completed controlled checks. This external check does not block completion of agent implementation work.

Check saved, unsaved, and unknown icons while signed in, while scrolling, on post-detail pages, and in narrow layouts. Check that manual native Save and Unsave actions also update the shortcut icon.
