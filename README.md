# Userscripts

Browser userscripts for Threads, Reddit, PTT, and YouTube. Each script is a standalone `.user.js` file: the source is the installation file. No build or npm commands are required to install or run it.

## Scripts

| Script                                                       | Purpose                                                    | Install                            |
| ------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------- |
| [Threads Saved Button](src/threads-saved-button/README.md)   | Add a save/unsave button after Share on Threads posts.     | [Install][threads-install]         |
| [Threads Country Label](src/threads-country-label/README.md) | Show public account locations beside Threads authors.      | [Install][threads-country-install] |
| [Reddit Saved Button](src/reddit-saved-button/README.md)     | Add a save/unsave button after Share on Reddit posts.      | [Install][reddit-install]          |
| [PTT Auto Media](src/ptt-auto-media/README.md)               | Display linked images and videos inline in PTT articles.   | [Install][ptt-install]             |
| [YouTube Live Rewind](src/youtube-live-rewind/README.md)     | Enable the native DVR timeline for supported live streams. | [Install][youtube-install]         |

[threads-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/threads-saved-button/threads-saved-button.user.js
[threads-country-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/threads-country-label/threads-country-label.user.js
[reddit-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/reddit-saved-button/reddit-saved-button.user.js
[ptt-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/ptt-auto-media/ptt-auto-media.user.js
[youtube-install]: https://raw.githubusercontent.com/narumiruna/userscripts/main/src/youtube-live-rewind/youtube-live-rewind.user.js

Script names link to their documentation. Each script README links to its source and contains its usage, limits, privacy details, and validation status.

## Install

1. Install a userscript manager, such as Tampermonkey or Violentmonkey.
2. Open an **Install** link in the index, or paste its URL into the manager's URL installation field.
3. Review the script's metadata and install it.
4. Reload the target site and follow the script-specific instructions.

Installation and update URLs use the source files on `main`; those files must be published before the URLs work. For a local or unpublished version, create a script in your manager and replace its contents with the source.

## Privacy and permissions

All scripts use `@grant none` and `@noframes` and do not write to browser storage. Each script README describes its data sources, network requests, and site-specific limits.

## Development

```sh
npm ci
npm run ci
```

| Command             | Check                                                                             |
| ------------------- | --------------------------------------------------------------------------------- |
| `npm run check`     | Biome formatting and lint checks.                                                 |
| `npm run typecheck` | JavaScript and JSDoc types in `src/**/*.js`, using `jsconfig.json` with `noEmit`. |
| `npm test`          | Vitest and jsdom tests that load the installation source directly.                |
| `npm run ci`        | All three checks above, in order.                                                 |

Keep each independent userscript in its own directory under `src/`, with metadata and implementation in the same `.user.js` file. Use JSDoc for types that JavaScript cannot infer. TypeScript is a development-only checker and emits no files. Increase the script's `@version` when publishing an update.

This repository does not publish an npm package and has no build, start, or npm release command.

Automated tests execute the exact installation source.

## License

[AGPL-3.0-only](LICENSE). See each script README for additional asset-license notices.
