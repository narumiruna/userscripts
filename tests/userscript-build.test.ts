import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Script } from "node:vm"
import { JSDOM } from "jsdom"
import { beforeAll, expect, test } from "vitest"

const root = fileURLToPath(new URL("../", import.meta.url))
let bundle: string

beforeAll(() => {
  execFileSync(process.execPath, ["scripts/build-userscripts.mjs"], { cwd: root })
  bundle = readFileSync(new URL("../dist/threads-saved-button.user.js", import.meta.url), "utf8")
})

test("builds installable userscript metadata at the start of the file", () => {
  const metadata = readFileSync(
    new URL("../src/threads-saved-button/userscript.meta.txt", import.meta.url),
    "utf8",
  )
  expect(bundle.startsWith(metadata.trimEnd())).toBe(true)
  expect(bundle).toContain("// @grant        none")
  expect(bundle).toContain("// @noframes")
  expect(bundle).toContain("https://www.threads.com/*")
  expect(bundle).toContain("https://www.threads.net/*")
})

test("builds plain JavaScript without runtime module dependencies", () => {
  expect(() => new Script(bundle)).not.toThrow()
  expect(bundle).not.toMatch(/\brequire\s*\(/)
  expect(bundle).not.toMatch(/^\s*(import|export)\s/m)
})

test("the bundled entry point starts once and handles dynamically loaded posts", async () => {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://www.threads.com/",
    runScripts: "outside-only",
  })
  try {
    dom.window.eval(bundle)
    dom.window.eval(bundle)
    const post = dom.window.document.createElement("section")
    post.innerHTML = `
      <div><a href="/@example/post/first"><time>now</time></a>
      <div><button aria-haspopup="menu" aria-expanded="false">
        <svg title="More"><title>More</title></svg>
      </button></div></div>
    `
    dom.window.document.body.append(post)
    await new Promise((resolve) => dom.window.setTimeout(resolve, 100))
    expect(post.querySelectorAll("button.threads-saved-button")).toHaveLength(1)
    expect(dom.window.document.querySelectorAll("#threads-saved-button-style")).toHaveLength(1)
  } finally {
    dom.window.close()
  }
})
