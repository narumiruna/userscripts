# E-Hentai Reader

Zoom reader images, save view settings, and resume from a locally saved reading position. Gallery pages combine resume and clear-history icons in one toolbar. Gallery lists keep a resume link beside each saved title.

[Source](e-hentai-reader.user.js) · [Reader toolbar preview](toolbar-preview.html) · [Gallery toolbar preview](gallery-toolbar-preview.html) · [Shared installation instructions](../../README.md#install).

## Setup

1. Install the source in Violentmonkey or another userscript manager.
2. Reload an E-Hentai or ExHentai page.
3. On a reader page, move the pointer over an image and hold **Ctrl** while turning the wheel.

The script matches HTTPS pages on `e-hentai.org` and `exhentai.org`. Zoom controls operate only on `/s/*` single-image readers and `/mpv/*` Multi-Page Viewers (MPV). Gallery lists show progress beside same-site gallery title links. Gallery pages put their saved resume link in the lower-right toolbar. Embedded frames are not supported.

Site access and MPV must already be available to the account. The script does not unlock them. Use the local source until the update is published on `main`; installation and update URLs do not publish local changes.

## Controls

The toolbar is a 64 px wide vertical column at the lower-right corner. Each icon control is 44 × 44 px. Reader page numbers and scale remain numeric.

Gallery pages use the same icon style. A bookmark-and-arrow link with a saved-page badge appears above the trash-can control. It replaces the resume text beside the gallery heading. Gallery lists keep their per-title text links; their floating toolbar contains only the trash-can control.

| Control                               | Result                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| Ctrl + wheel up/down over an image    | Increase/decrease image size around the pointer.                                        |
| Plus / minus icons or `+` / `=` / `-` | Multiply/divide image size by 1.1 around the reading-area center.                       |
| Horizontal-arrow icon / Shift + W     | Fit each page to the reading-area width. Show the start of the current page.            |
| Vertical-arrow icon / Shift + H       | Fit each page to the reading-area height. Leave space for the controls.                 |
| Counterclockwise-arrow icon / `0`     | Restore the site's image dimensions and save native size as the view preference.        |
| Bookmark-and-arrow icon               | Resume the saved page and relative vertical position.                                   |
| Location-pin icon                     | Replace the pending saved position with the current position, without a jump.           |
| Trash-can icon                        | After confirmation, remove this site's saved reading history. Keep the view preference. |

- Hover over an icon or focus it with Tab to show its name and shortcut on the left. Press Escape to close the tooltip.
- On reader pages, resume and start-here icons appear only while resume is pending. On gallery pages, the resume icon appears when that gallery has a valid saved position. The resume tooltip includes the saved page number.
- On short viewports, scroll inside the toolbar or use Tab to reach its controls. Tooltips remain outside the scroll area.
- Storage errors and clear-history notices appear to the left without changing the toolbar width.
  - Clear-history notices close after 2.8 seconds and remain visible if the gallery toolbar closes. Storage errors remain visible.
- Icons use inline SVG. They do not require external fonts or image requests.

Manual scaling uses a common factor for all MPV pages. Fit modes calculate a separate factor for each page. The scale range is 10–800%; images outside this range cannot fit exactly.

The script preserves native page navigation, including arrow keys, Space, and unmodified W/A/S/D. Keyboard zoom shortcuts do not operate in input fields or editable content. Ctrl + `+`/`-`/`0` remain browser shortcuts. Ctrl + wheel outside a reader image keeps its browser behavior.

## Reading progress and resume

- Progress records contain the gallery ID, last viewed page, reader path, and relative vertical position. They do not mean that all earlier pages were read. Reading backward updates the position too.
- MPV selects the page nearest the center of its reading area, including unloaded placeholders. Progress does not depend on the URL fragment or the number of loaded images.
- New reading sessions save after a 300 ms pause in scrolling or layout updates. Leaving or hiding the page also saves the current position.
- An ordinary visit does not jump to a saved position. While resume is pending, startup, resizing, restored view settings, programmatic scrolling, and page exit do not replace it.
  - Select **繼續閱讀** to resume, or **從此處閱讀** to start at the current position.
  - Native reading input, such as ordinary scrolling, supported navigation keys, or page navigation, also selects the current position and dismisses the pending resume.
- Resume links on gallery lists and gallery pages open the saved reader. Single-image links use `#eh-reader-resume`. MPV links use `?eh-reader-resume=N:O#pageN`, where `N` is the page and `O` is its relative offset from 0 to 1. This snapshot keeps the selected position if storage changes before the reader opens. After restoration, the script removes its marker and keeps MPV's native `#pageN` fragment. Ctrl/Meta/Shift-click keeps the browser's link behavior.
  - Older `?eh-reader-resume=1#pageN` links remain supported. If their native page differs from the stored record, resume uses that page's start; the old link does not contain an offset to recover.
- A single-image reader can navigate to the saved reader path. MPV can resume the saved page within its current viewer, even when the record came from a single-image reader.
- MPV first scrolls to an unloaded target to let the native viewer load it. It applies the saved offset again after the image becomes available. A missing or failed target leaves the saved record unchanged; starting elsewhere cancels the pending restoration.
  - Pending restoration can finish in a background tab even when the browser suspends animation frames.
  - After restoration, MPV keeps the saved page and offset through delayed native startup and image resizing. Passive updates do not replace that record. Reading input or an explicit view change releases the restored position. Native reading keys also work when a toolbar control has focus.
- Native same-tab navigation between different single-image reader paths uses a one-use `sessionStorage` handoff. It is bound to the destination path and is consumed on arrival, including same-document navigation. A later reload offers resume normally.
  - MPV page and thumbnail links do not create handoffs. Old MPV handoffs are consumed but ignored. An explicit resume request takes priority over a handoff.
- A progress update from another tab pauses local writes and offers the newer position without moving the current page. New local reading input can replace that position. Gallery links and saved-page badges update when storage changes.
- Clear history cancels pending writes and removes a pending resume marker. Starting elsewhere or receiving a progress change from another tab also cancels that marker. Passive layout updates and page exit do not recreate the cleared record. New reading input can start a new record.

Relative position is measured from the reading area's top edge within the current image. Horizontal scroll position is not saved. Restoration is limited by the available scroll range. Changes to image dimensions or site navigation can affect the final position.

## Saved view settings

The last explicit native-size, manual-scale, fit-width, or fit-height choice is saved for the current site. It is shared across galleries and both reader types on that site.

The preference is applied on the next reader page, including reloads and single-image page changes. Restoring a fit preference does not intentionally move to the page start; selecting a fit control does. Fit modes use the current viewport rather than saved pixel dimensions. Reset changes the saved preference to native size.

Scaling is relative to the site's current dimensions, not necessarily the original file resolution. Native image resizing after a window-size change still applies. Reset restores the site's layout, not browser zoom.

## Behavior and limits

- Layout dimensions change, not only the visual image transform. MPV placeholders receive scaled dimensions so native page offsets and image loading can use the new layout.
- Native inline image styles and event handlers stay unchanged. Newly loaded or replaced images receive the current scale.
- Pointer anchoring is limited by the scroll range. A centered image smaller than the viewport cannot move beyond that range.
- MPV keeps its vertical scrollbar hidden. Ordinary wheel input and keyboard navigation still scroll vertically. Oversized images have a horizontal scrollbar. Single-image readers keep their native document scrollbars.
- The script does not add a continuous reader, request higher-resolution files, increase image quality, or bypass access limits. Other reader scripts can conflict with its layout rules.
- Gallery indicators show only saved records on the current origin. They do not fetch gallery metadata or calculate a completion percentage.
  - On lists, each native `.glink` gallery title gets at most one single-line resume link.
  - On a `/g/*` gallery page, the current gallery's resume link appears only in the toolbar, not beside `#gn` or another link to the same gallery. The URL identifies the gallery even if its title is absent.
  - The icon badge shows the saved page. Long numbers are clipped to the badge width; the tooltip and accessible label retain the full number.
  - Pagination, thumbnail links, and other navigation links remain unchanged.
- Invalid storage records are ignored. If storage is blocked or full, zoom still works and the toolbar reports that changes cannot be saved. History has no automatic expiry; clear it when it is no longer needed.
- The script requires a current browser with MutationObserver, requestAnimationFrame, localStorage, sessionStorage, and abortable event listeners. Site markup and native navigation can change.

To remove page changes, disable the script and reload. Saved data remains until it is cleared through the script or the browser's site-data controls.

## Privacy

- Persistent data uses `localStorage` keys `eh-reader:preferences` and `eh-reader:progress:<gallery ID>`. A tab-local `eh-reader:continue` key in `sessionStorage` holds the expected next reader path until it is consumed.
- Reader paths contain the site's gallery or image-link token. The script does not store query strings, gallery titles, tags, image file URLs, credentials, or cookies.
- Storage is not encrypted. Same-origin site scripts and other scripts with page access can read it. All accounts using the same origin and browser storage share it.
- E-Hentai and ExHentai keep separate data. The script does not sync between origins, browsers, or devices.
- An MPV resume URL contains the selected page and relative offset. The browser sends this query with the navigation to the site and can keep it in history. The script removes it from the current URL after restoration.
- Clearing history removes only the script's progress keys, not view preferences or other site data.
- The script has no runtime dependencies. It uses `@grant none` and `@noframes`, adds no background network requests, and does not log gallery data.

Each native reader still loads images under its normal rules. Smaller images can put more pages in view. Explicit resume and normal navigation can cause the site to load the selected page and nearby images.

## Validation

### Version 0.4.2

Version 0.4.2 passed `npm run ci`: formatting, lint, JavaScript type checks, and all 801 Vitest/jsdom tests, including 259 reader tests. Full CI used an LF copy with the changed files applied to preserve the existing CRLF checkout. Twenty-one new cases cover resume snapshots, replaced or missing records, legacy page disagreement, MPV handoff suppression, native hash navigation, explicit single-image resume, background loading without animation frames, cancellation, and invalid request data.

A replay against 0.4.1 showed that native MPV hash links could leave a single-image continuation marker. That marker could suppress explicit resume on the next load and allow page 1 to replace the saved record. Another replay showed that a legacy link to a later page used page 1 when storage had already changed to page 1.

The installed 0.4.2 source was read back and matched the repository source. A temporary URL-scoped diagnostic script checked an authorized live ExHentai MPV with 46 pages. Before the fix ran, its record was page 1 while its explicit legacy link requested page 12. The corrected reader restored page 12 in a hidden tab, loaded the target image, removed the resume query, and retained page 12 at the page start through the 10-second check. The target image started within 1 px of the expected reading-area offset. The fit-height preference stayed unchanged. The temporary script was removed; the reader retains `@grant none` and adds no diagnostic logging.

The original page-12 offset was not available in the replaced record or legacy URL, so this check restored only the page start. It did not recover the old offset. Live checks read DOM geometry and loading state, not gallery content or image URLs; they do not establish behavior for all galleries. Reload other existing MPV tabs to load 0.4.2; their injection was not checked.

Headless Chromium 158.0.8127.18 also passed the 12 neutral MPV combinations on both origins: early/late injection, native size, fit-width, and 10% scale. Gallery resume, delayed resets, target replacement, idle refresh, toolbar-focused PageDown, native wheel/D navigation, history clearing, retained preferences, and ordinary visits passed. Saved relative offsets matched within 0.003. No page errors occurred.

### Version 0.4.1

Version 0.4.1 passed `npm run ci`: formatting, lint, JavaScript type checks, and all 780 Vitest/jsdom tests, including 238 reader tests. Full CI used an LF copy of the tracked source with the changed files applied; the existing CRLF checkout was preserved. Fifteen new reader cases cover gallery-to-MPV resume, fragment replacement before injection, delayed native resets, late image resizing, query cleanup, saved-page protection, scroll-loop prevention, and release through reading input, view controls, history clearing, and cross-tab updates.

Headless Chromium 158.0.8127.18 checked the exact source with neutral images and the site's native MPV code on both origins. Twelve combinations covered native size, fit-width, and 10% manual scale, with injection before or after native startup. Gallery links restored page 17 and its relative offset within 0.003. Delayed resets and image replacement preserved the position and saved record. Checks also covered idle refresh behavior, toolbar-focused PageDown, physical wheel input, native D navigation, history clearing, retained preferences, and ordinary visits that leave resume pending. No page errors occurred.

The existing neutral gallery checks also passed in headless Chrome 156.0.8078.80 on both origins at desktop and mobile sizes. They covered single-image resume, cross-tab updates, clear confirmation, tooltips, storage failures, and unchanged native gallery layout.

The installed Violentmonkey source was updated to 0.4.1 and read back to confirm that it matches the repository source. The manager matched the new MPV resume URL on both origins. Existing live tabs were not reloaded.

Live-gallery restoration was not verified. After installing the update, reload the gallery and reader pages, then select the saved-page resume control. Check that the page and vertical position remain correct after image loading. These fixture checks do not establish live-site or userscript-manager injection behavior.

### Version 0.4.0

Version 0.4.0 passed `npm run ci`: formatting, lint, JavaScript type checks, and all 765 Vitest/jsdom tests, including 223 reader tests. Full CI used a separate LF worktree to preserve the existing CRLF Windows checkout.

Headless Chrome 156.0.8078.80 checked the exact source with neutral intercepted fixtures on both site origins. Gallery checks at 1440 × 960, 390 × 844, and 320 × 480 px covered saved pages 1 and 128, control sizes, tooltip bounds, Tab/Escape, unchanged heading/pagination/thumbnail DOM and dimensions, galleries without title markers, real cross-tab updates, native resume navigation, reader restoration, list links, clear confirmation/cancellation, retained preferences, notice expiry, observer stability, and cleanup. A 320 × 568 px case checked readable storage failures. No page errors or external asset requests occurred in the gallery checks.

The existing single-image and native MPV browser checks also passed on both origins, including zoom, fit states, physical Ctrl + wheel, native wheel/D navigation, resume, short-height keyboard access, and cleanup. These checks used fixtures, not live galleries or userscript-manager injection.

### Version 0.3.0

Version 0.3.0 passed `npm run ci`: formatting, lint, JavaScript type checks, and all 724 Vitest/jsdom tests, including 182 reader tests. The full check used a separate LF worktree because the primary Windows checkout uses CRLF. New cases cover icon labels, numeric page display, control groups and sizes, SVG click targets, dynamic resume tooltips, pointer and keyboard focus, Escape, short-height scrolling, hidden or disabled controls, status expiry, observer stability, and cleanup.

Headless Chrome 156.0.8078.80 checks used neutral intercepted fixtures and the site's native `ehg_mpv.c.js` code. They passed on both site origins and reader types at 1440 × 960, 390 × 844, and 320 × 480 px. They verified the 64 px dock, 44 px controls, tooltip bounds, Tab access after automatic toolbar scrolling, fit states, cross-document single-image resume, MPV resume, physical Ctrl + wheel input, native wheel and D navigation, confirmation cancellation, history clearing, retained preferences, and cleanup. A separate 320 × 568 px case verified readable storage-error messages and working zoom. No page errors occurred.

These checks did not use live galleries or userscript-manager injection.

### Earlier validation

Version 0.2.1 passed JavaScript type checks and all 706 repository Vitest/jsdom tests, including eight new gallery-placement regression cases. The reader tests load the exact installation source. They cover both sites and reader types, persistent view settings, explicit resume, delayed MPV loading and resizing, single-image navigation, storage validation and failure, cross-tab changes, history clearing, gallery indicators, and the existing zoom behavior.

```sh
npm test -- tests/e-hentai-reader.test.js tests/e-hentai-reader-state.test.js
npm run typecheck
npx biome check src/e-hentai-reader/e-hentai-reader.user.js tests/e-hentai-reader.test.js tests/e-hentai-reader-state.test.js
npm run ci
```

Headless Chromium 158.0.8127.18 checks used neutral SVG images and the site's `ehg_mpv.c.js` native reader code in intercepted fixtures. They verified MPV page/offset resume after reopening, saved fit-width mode, native wheel and keyboard navigation after resume, gallery resume links, history clearing, physical Ctrl + wheel input, saved manual scale, native single-image navigation, and cross-document resume. MPV and single-image relative offsets matched the saved values within 0.003. No page errors occurred.

Additional pagination fixtures reproduced the version 0.2.0 layout defect on both site origins at viewport widths of 320 and 1280 px. The old source inserted eight resume links into two pagination tables and increased each table's height from 30 to approximately 121 px. Version 0.2.1 left both tables' DOM and height unchanged, kept one single-line resume link beside the gallery heading, and produced no page errors.

Version 0.2.1 was not installed in a userscript manager or checked on a live gallery during this update. Browser fixtures verify browser layout and native MPV integration, not live-site markup or manager injection. Earlier zoom-only versions had separate live-page manager checks.
