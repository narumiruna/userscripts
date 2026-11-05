import { readFileSync } from "node:fs"
import { Script } from "node:vm"
import { JSDOM } from "jsdom"
import { expect, test } from "vitest"

const source = readFileSync(
  new URL("../src/threads-saved-button/threads-saved-button.user.js", import.meta.url),
  "utf8",
)
const installUrl =
  "https://raw.githubusercontent.com/narumiruna/userscripts/main/src/threads-saved-button/threads-saved-button.user.js"

test("the source starts with installable userscript metadata", () => {
  const header = source.match(/^\/\/ ==UserScript==\n[\s\S]*?\/\/ ==\/UserScript==/)
  expect(header).not.toBeNull()
  expect(header[0]).toMatch(/^\/\/ @version\s+0\.2\.4$/m)
  expect(header[0]).toMatch(/^\/\/ @grant\s+none$/m)
  expect(header[0]).toMatch(/^\/\/ @noframes$/m)
  expect(header[0]).toMatch(/^\/\/ @run-at\s+document-idle$/m)
  const matches = [...header[0].matchAll(/^\/\/ @match\s+(.+)$/gm)].map((match) => match[1])
  expect(matches).toEqual([
    "https://www.threads.com/*",
    "https://threads.com/*",
    "https://www.threads.net/*",
    "https://threads.net/*",
  ])
})

test("installation and update URLs point to the source, not a generated file", () => {
  for (const field of ["downloadURL", "updateURL"]) {
    const value = source.match(new RegExp(`^// @${field}\\s+(.+)$`, "m"))
    expect(value?.[1]).toBe(installUrl)
  }
})

test("the source is plain JavaScript with no runtime dependencies or global API", () => {
  expect(() => new Script(source)).not.toThrow()
  expect(source).not.toMatch(/\brequire\s*\(/)
  expect(source).not.toMatch(/^\s*(import|export)\s/m)
  expect(source).not.toMatch(/^\/\/ @(require|resource)\s/m)
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://www.threads.com/",
    runScripts: "outside-only",
  })
  try {
    const cleanup = dom.window.eval(source)
    expect(dom.window.startThreadsSavedButton).toBeUndefined()
    expect(dom.window.labelOf).toBeUndefined()
    cleanup()
  } finally {
    dom.window.close()
  }
})

test("the unbuilt source starts once, handles new posts, and cleans up", async () => {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://www.threads.com/",
    runScripts: "outside-only",
  })
  try {
    const cleanup = dom.window.eval(source)
    const duplicateCleanup = dom.window.eval(source)
    duplicateCleanup()
    const post = dom.window.document.createElement("section")
    post.innerHTML = `
      <div><a href="/@example/post/first"><time>now</time></a>
      <div><button aria-haspopup="menu" aria-expanded="false">
        <svg title="More"><title>More</title></svg>
      </button></div></div>
      <div class="actions">
        <div><button><svg title="Like"></svg></button></div>
        <div><button><svg title="Comment"></svg></button></div>
        <div><button><svg title="Repost"></svg></button></div>
        <div class="share"><button><svg title="Share"></svg></button></div>
      </div>
    `
    dom.window.document.body.append(post)
    await new Promise((resolve) => dom.window.setTimeout(resolve, 100))
    expect(post.querySelectorAll("button.threads-saved-button")).toHaveLength(1)
    expect(post.querySelector("button.threads-saved-button").previousElementSibling).toBe(
      post.querySelector(".share"),
    )
    expect(dom.window.document.querySelectorAll("#threads-saved-button-style")).toHaveLength(1)
    cleanup()
    expect(post.querySelectorAll("button.threads-saved-button")).toHaveLength(0)
    expect(dom.window.document.getElementById("threads-saved-button-style")).toBeNull()
    expect(dom.window.document.getElementById("threads-saved-button-status")).toBeNull()
  } finally {
    dom.window.close()
  }
})
