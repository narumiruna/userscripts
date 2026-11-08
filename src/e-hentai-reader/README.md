# E-Hentai Reader

Zoom reader images, save view settings, and resume from a locally saved reading position. Gallery lists and gallery pages show a resume link when a saved position is available.

[Source](e-hentai-reader.user.js) · [Toolbar design preview](toolbar-preview.html) · [Shared installation instructions](../../README.md#install).

## Setup

1. Install the source in Violentmonkey or another userscript manager.
2. Reload an E-Hentai or ExHentai page.
3. On a reader page, move the pointer over an image and hold **Ctrl** while turning the wheel.

The script matches HTTPS pages on `e-hentai.org` and `exhentai.org`. Zoom controls operate only on `/s/*` single-image readers and `/mpv/*` Multi-Page Viewers (MPV). Other pages can show progress beside same-site gallery title links or the gallery heading. Embedded frames are not supported.

Site access and MPV must already be available to the account. The script does not unlock them. Use the local source until the update is published on `main`; installation and update URLs do not publish local changes.

## Controls

The reader toolbar is a 64 px wide vertical column at the lower-right corner. Each icon control is 44 × 44 px. The page number and scale remain numeric. Gallery pages keep their text controls.

| Control                                     | Result                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Ctrl + wheel up/down over an image          | Increase/decrease image size around the pointer.                                        |
| Plus / minus icons or `+` / `=` / `-`       | Multiply/divide image size by 1.1 around the reading-area center.                       |
| Horizontal-arrow icon / Shift + W           | Fit each page to the reading-area width. Show the start of the current page.            |
| Vertical-arrow icon / Shift + H             | Fit each page to the reading-area height. Leave space for the controls.                 |
| Counterclockwise-arrow icon / `0`           | Restore the site's image dimensions and save native size as the view preference.        |
| Bookmark-and-arrow icon                     | Resume the saved page and relative vertical position.                                   |
| Location-pin icon                           | Replace the pending saved position with the current position, without a jump.           |
| Trash-can icon / gallery clear-history text | After confirmation, remove this site's saved reading history. Keep the view preference. |

- Hover over an icon or focus it with Tab to show its name and shortcut on the left. Press Escape to close the tooltip.
- Resume and start-here icons appear only while resume is pending. The resume tooltip includes the saved page number.
- On short viewports, scroll inside the toolbar or use Tab to reach its controls. Tooltips remain outside the scroll area.
- Storage errors and clear-history notices appear to the left without changing the toolbar width.
  - Clear-history notices close after 2.8 seconds. Storage errors remain visible.
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
- Resume links on gallery lists and gallery pages open the saved reader. Their `#eh-reader-resume` fragment requests an explicit resume and is removed after restoration. Ctrl/Meta/Shift-click keeps the browser's link behavior.
- A single-image reader can navigate to the saved reader path. MPV can resume the saved page within its current viewer, even when the record came from a single-image reader.
- MPV first scrolls to an unloaded target to let the native viewer load it. It applies the saved offset again after the image becomes available. A missing or failed target leaves the saved record unchanged; starting elsewhere cancels the pending restoration.
- Native same-tab single-image links use a one-use `sessionStorage` handoff. It is bound to the destination path and is consumed on arrival, including same-document navigation. A later reload offers resume normally.
- A progress update from another tab pauses local writes and offers the newer position without moving the current page. New local reading input can replace that position. Gallery badges update when storage changes.
- Clear history cancels pending writes. Passive layout updates and page exit do not recreate the cleared record. New reading input can start a new record.

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
  - Resume links appear beside native `.glink` gallery title links and the `#gn` gallery heading. Each title gets at most one link, and its label stays on one line.
  - Pagination, thumbnail links, and other navigation links remain unchanged.
- Invalid storage records are ignored. If storage is blocked or full, zoom still works and the toolbar reports that changes cannot be saved. History has no automatic expiry; clear it when it is no longer needed.
- The script requires a current browser with MutationObserver, requestAnimationFrame, localStorage, sessionStorage, and abortable event listeners. Site markup and native navigation can change.

To remove page changes, disable the script and reload. Saved data remains until it is cleared through the script or the browser's site-data controls.

## Privacy

- Persistent data uses `localStorage` keys `eh-reader:preferences` and `eh-reader:progress:<gallery ID>`. A tab-local `eh-reader:continue` key in `sessionStorage` holds the expected next reader path until it is consumed.
- Reader paths contain the site's gallery or image-link token. The script does not store query strings, gallery titles, tags, image file URLs, credentials, or cookies.
- Storage is not encrypted. Same-origin site scripts and other scripts with page access can read it. All accounts using the same origin and browser storage share it.
- E-Hentai and ExHentai keep separate data. The script does not sync between origins, browsers, or devices, and does not send history to a server.
- Clearing history removes only the script's progress keys, not view preferences or other site data.
- The script has no runtime dependencies. It uses `@grant none` and `@noframes`, adds no background network requests, and does not log gallery data.

Each native reader still loads images under its normal rules. Smaller images can put more pages in view. Explicit resume and normal navigation can cause the site to load the selected page and nearby images.

## Validation

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
