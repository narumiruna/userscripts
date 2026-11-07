# E-Hentai Reader

Zoom images without zooming the browser interface. Use the floating controls to fit an image to the reading area or restore the site's image size.

[Source](e-hentai-reader.user.js) · [Shared installation instructions](../../README.md#install).

## Setup

1. Install the source in Violentmonkey or another userscript manager.
2. Reload an E-Hentai or ExHentai reader page.
3. Move the pointer over an image and hold **Ctrl** while turning the wheel.

The script runs on HTTPS `e-hentai.org` and `exhentai.org`, only on `/s/*` single-image readers and `/mpv/*` Multi-Page Viewers (MPV). Gallery indexes, search pages, and embedded frames are not supported. Site access and MPV must already be available to the account; the script does not unlock them.

Use the local source until it is published on `main`. The installation and update URLs do not publish local changes.

## Controls

| Control                            | Result                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| Ctrl + wheel up/down over an image | Increase/decrease image size around the pointer.                                              |
| `+` or `=` / `-`                   | Multiply/divide image size by 1.1 around the reading-area center.                             |
| **適寬** / Shift + W               | Fit each page to the reading-area width. Show the start of the current page.                  |
| **適高** / Shift + H               | Fit each page to the reading-area height. Leave space for the toolbar and MPV image controls. |
| **重設** / `0`                     | Restore the site's current image dimensions.                                                  |

The toolbar shows the current page's scale. Manual scaling uses a common factor for all MPV pages. Fit modes calculate a separate factor for each page. The scale range is 10–800%; images outside this range cannot fit exactly.

Scaling is relative to the site's current dimensions, not necessarily the original file resolution. Native image resizing after a window-size change still applies. Reset restores the site's layout, not the browser's zoom level.

The script preserves native MPV scrolling and page navigation, including arrow keys, Space, and the unmodified W/A/S/D keys. It does not change image-click navigation. Keyboard shortcuts do not operate in input fields or editable content. Ctrl + `+`/`-`/`0` remain browser shortcuts. Ctrl + wheel outside a reader image keeps its browser behavior.

## Behavior and limits

- The script adjusts layout dimensions, not only the visual image transform. MPV placeholders receive scaled dimensions so native page offsets and image loading can use the new layout.
- Native inline image styles and native event handlers stay unchanged. Newly loaded or replaced images receive the current scale.
- Pointer-position preservation is limited by the available scroll range. A centered image that is smaller than the viewport cannot move beyond that range.
- MPV keeps its vertical scrollbar hidden, as on the native reader. Ordinary wheel input and keyboard navigation still scroll vertically. A horizontal scrollbar is available when an enlarged image is wider than the reading area. Single-image pages keep their native document scrollbars.
- Settings stay in page memory. A full reload or navigation to another single-image page resets them. MPV page changes within the same document retain them.
- The script does not add a continuous reader to single-image pages, request higher-resolution files, increase image quality, or bypass access limits. Other reader scripts can conflict with its layout rules.
- The script requires a current browser with MutationObserver, requestAnimationFrame, and abortable event listeners. Site markup and native MPV behavior can change.

To remove the changes, disable the script in the manager and reload the page.

## Privacy

The script reads reader-element dimensions and changes styles in page memory. It does not read credentials, add network requests, log gallery data, or write browser storage. It has no runtime dependencies and uses `@grant none` and `@noframes`.

Each site's native reader still loads images under its normal rules. A smaller image size can put more pages in view and cause the native reader to load more images.

## Validation

Version 0.1.2 passed 81 focused Vitest/jsdom tests, JavaScript type checks, and formatting/lint checks for the source and tests. Tests load the exact installation source and cover both reader types on E-Hentai and ExHentai, unchanged non-reader pages, late native pane sizing, and actions before a pending observer frame. Run them with:

```sh
npm test -- tests/e-hentai-reader.test.js
npm run typecheck
npx biome check src/e-hentai-reader/e-hentai-reader.user.js tests/e-hentai-reader.test.js
```

Headless Chromium 158.0.8127.18 checks used neutral SVG images in single-image and MPV fixtures. The MPV fixture used the site's `ehg_mpv.c.js` native reader code. Checks covered actual Ctrl + wheel input, pointer anchoring, unchanged browser zoom and native inline styles, native wheel scrolling and page navigation, lazy-loaded images, scaled placeholders, fit modes, native window resizing, unchanged control-icon sizes, horizontal scrolling, reset, and input-field isolation.

Version 0.1.2 regression checks first reproduced the unwanted vertical scrollbar with the previous overflow rule. After the fix, Chromium kept `overflow-y: hidden`, no vertical scrollbar gutter, and the same reading-area width during Ctrl + wheel zoom. Native wheel scrolling, page navigation, both fit modes, and horizontal scrolling for oversized images still passed. The exact source was updated through Violentmonkey MCP. No real reader tab was open during this update; this scrollbar fix was checked in the neutral browser fixture, not on a live gallery.

`npm run ci` passed in a clean LF checkout: formatting, lint, JavaScript types, and all 623 tests. The original CRLF working tree had six existing source-check failures and repository-wide formatting errors. Those unrelated line-ending changes are not included in this script.

For version 0.1.0, Violentmonkey MCP installed and enabled the exact source on a real E-Hentai MPV page and reported successful injection. A temporary validation script dispatched a cancelable Ctrl + wheel event: image width increased from 1280 to 1487 px, the event was canceled, and vertical pointer-anchor error was below 1 px. Fit width produced a 1563 px image in a 1565 px reading area. Fit height produced a 940 px image in a 1022 px area. Reset restored 1280 px, native inline styles stayed unchanged, and the native keyboard handler was retained. The validation restored native size and the initial scroll position.

Version 0.1.1 was installed through Violentmonkey MCP on a real ExHentai MPV page. The same synthetic-event checks passed: image width increased from 1000 to approximately 1162 px, vertical pointer-anchor error was below 1 px, fit width produced 1563 px in a 1565 px area, fit height produced 940 px in a 1022 px area, and reset restored 1000 px. Native inline styles and the keyboard handler stayed unchanged. The validation restored native size and the initial scroll position.

Temporary diagnostic and validation scripts are disabled. MCP deletion attempts recreated their entries; they are not required to use the reader.

Real-page checks used synthetic events, not physical mouse input. Actual wheel input was tested only in the neutral Chromium fixtures. Single-image manager execution and other browsers require a separate user check; fixture tests alone do not verify them.
