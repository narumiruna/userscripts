# YouTube Live Rewind

Use YouTube's native draggable DVR timeline on active live streams that disable rewind. The script does not add a separate slider or a rewind-button panel.

[Source](youtube-live-rewind.user.js) · [Shared installation instructions](../../README.md#install).

- **Site:** HTTPS `www.youtube.com`, using the desktop watch player. The script starts on all paths so navigation from the home page can receive patched player data. Mobile and embedded players are not supported.
- **Installation:** install the source in a userscript manager and fully reload YouTube. It must run at `document-start` in the page context, before the player reads its configuration. The metadata requests page-context execution for Tampermonkey and Violentmonkey.
- **Changes:** enable `isLiveDvrEnabled` for active live responses that do not already enable DVR. When an HLS/DASH manifest or direct audio and video URLs are available, disable server-driven playback settings and remove the server-ABR URL so seeks do not return to the live edge. Without a client-side source, keep the transport unchanged. Keep adaptive formats and their DVR limits. Normal videos, finished broadcasts, and already-enabled DVR responses stay unchanged.
- **Use:** move the pointer over the player and drag its existing timeline. The native controls remain available in fullscreen. Select YouTube's **Live** control to return to the live edge. If playback stalls, reload the page.
- **Limits:** the native DVR window and available server segments determine how far back playback can go. An enabled timeline does not prove that every earlier segment can load. The script does not record video, create missing segments, or extend the server's retention window. YouTube's internal response format can change.
- **Removal:** disable the script and reload YouTube to restore the original player setup.

## Privacy

YouTube Live Rewind changes player-response data in page memory. It does not make its own network requests, read credentials, or write to browser storage. YouTube's native player requests the selected media segments under the browser's normal network rules.

## Validation

Version 0.1.0 passed 56 focused tests and the full 462-test suite, formatting, lint, and JavaScript types. Tests load the exact installation source and cover initial inline data, parsed navigation responses, direct audio/video fallback without a manifest, missing fallback sources, unchanged normal and native-DVR videos, parser behavior, descriptor ownership, duplicate startup, and cleanup.

On 2026-11-04, the exact source was injected before page load in headless Chromium 156.0.8078.4 at 1280 × 800 px. Public stream `XMUjdlrDVFs` was live with DVR disabled before injection. Native pointer dragging sought roughly one minute back, five minutes back in fullscreen, and to broadcast time zero. Playback time and decoded video frames increased after each seek. The native **Live** control returned to live playback. A separate search-result click preserved the document and verified patched player data, native timeline dragging, and continued playback after in-site navigation. These checks used native controls, not direct playback-position assignments or a replacement timeline.

The originally supplied stream, `vUFuPPevafo`, ended during testing. Its live timeline dragging was not verified. The successful checks on another stream do not prove that every stream or earlier segment is available.

**User check:** after automated checks pass, install the local source through Tampermonkey or Violentmonkey and fully reload an active DVR-disabled stream. Check native dragging, fullscreen, the **Live** control, and navigation to another live video. Expected result: the selected earlier section plays while the broadcast continues. Userscript-manager document-start and page-context execution, signed-in playback, and other browsers remain unverified until checked. Do not claim manager compatibility from source-injection checks alone. Use the local source until it is published on `main`.
