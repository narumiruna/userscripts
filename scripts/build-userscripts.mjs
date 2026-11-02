import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const source = new URL("../src/threads-saved-button/", import.meta.url)
const metadata = await readFile(new URL("userscript.meta.txt", source), "utf8")

await build({
  entryPoints: [fileURLToPath(new URL("index.ts", source))],
  outfile: fileURLToPath(new URL("../dist/threads-saved-button.user.js", import.meta.url)),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  banner: { js: metadata.trimEnd() },
  legalComments: "none",
})
