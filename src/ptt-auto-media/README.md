# PTT Auto Media

Open a PTT article to display supported media links inline. The script runs on HTTPS `www.ptt.cc` and `ptt.cc` article paths under `/bbs/*/M.*.html`. It does not accept PTT's age-confirmation form; complete that step yourself when required.

[Source](ptt-auto-media.user.js) · [Shared installation instructions](../../README.md#install).

## Supported media

- **Direct images:** JPEG, PNG, GIF, WebP, AVIF, and BMP, including URLs with query strings.
- **Imgur:** single-image pages, direct images, MP4/WebM, and GIFV links converted to MP4. Albums and galleries remain links.
- **Twitter images:** `pbs.twimg.com/media/` URLs, including `?format=jpg` and size suffixes.
- **Direct videos:** MP4, WebM, OGV, and M4V. Playback depends on browser codec support.
- **YouTube:** watch, short-link, Shorts, live, and embed URLs with a video ID. Channel and playlist links remain links. New embeds use `youtube-nocookie.com`.

## Display and playback

Original links remain available. Existing PTT images and players are reused rather than duplicated. New comment previews appear after the complete comment row, so the author and timestamp stay on their original line. Repeated links in separate comments can each have a preview.

Images load lazily. New videos have native controls and request metadata; they do not autoplay or loop. Animated GIFs use normal browser animation. Media fits the article width; images and direct videos also fit within 85% of the viewport height.

The script handles added or changed links and replaced article content. Failed generated previews show an error and an original-link fallback. Removed files, host restrictions, unsupported codecs, or YouTube embedding restrictions can prevent display or playback. An iframe load event does not confirm video playback.

## Privacy

This script does not call private APIs or read account credentials.

PTT previews load content from media hosts under the browser's cookie and network rules. New images omit the `Referer` header; new YouTube frames send only the page origin. The script does not scrape linked pages. It upgrades HTTP media URLs to HTTPS and does not embed non-HTTP(S), credential-bearing, localhost, single-label, or literal-IP URLs.

## Validation

Automated tests execute the exact installation source. Controlled Chromium checks covered media display and basic playback. Browser checks used local article snapshots because live navigation required age confirmation. Live PTT playback and userscript-manager integration remain unverified.

## Manual check

After automated and controlled checks pass, install the local source through a userscript manager. Complete PTT age confirmation yourself if required. Check image display and video playback on live articles. Expected result: supported media appears inline, original links remain available, and new videos do not autoplay. An iframe load event does not confirm YouTube playback.
