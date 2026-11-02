// @vitest-environment jsdom
import { Script } from "node:vm"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import source from "../src/ptt-auto-media/ptt-auto-media.user.js?raw"
import articles from "./fixtures/ptt-auto-media.json"

const script = new Script(source)
const PREVIEW = ".ptt-auto-media"
let stop
let main

function startPttAutoMedia() {
  const cleanup = script.runInThisContext()
  if (typeof cleanup !== "function") throw new Error("Expected userscript cleanup")
  return cleanup
}

function addLink(href, root = main) {
  const link = document.createElement("a")
  link.href = href
  link.textContent = href
  link.target = "_blank"
  link.rel = "noreferrer noopener nofollow"
  root.append(link, "\n")
  return link
}

function addNative(link, src = link.href, tag = "img") {
  const native = document.createElement("div")
  native.className = "richcontent"
  const element = document.createElement(tag)
  element.src = src
  native.append(element)
  const anchor = link.closest(".push") || link
  anchor.after(native)
  return native
}

async function tick(ms = 60) {
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
  document.head.innerHTML = ""
  document.body.innerHTML = '<div id="main-content"></div>'
  main = document.getElementById("main-content")
  stop = () => {}
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {})
})

afterEach(() => {
  stop()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test("the exact source is an installable classic PTT userscript with no runtime dependencies", () => {
  const header = source.match(/^\/\/ ==UserScript==\n[\s\S]*?\/\/ ==\/UserScript==/)
  expect(header).not.toBeNull()
  expect(header[0]).toMatch(/^\/\/ @name\s+PTT Auto Media$/m)
  expect(header[0]).toMatch(/^\/\/ @namespace\s+userscripts\/ptt-auto-media$/m)
  expect(header[0]).toMatch(/^\/\/ @version\s+0\.1\.0$/m)
  expect(header[0]).toMatch(/^\/\/ @grant\s+none$/m)
  expect(header[0]).toMatch(/^\/\/ @noframes$/m)
  expect(header[0]).toMatch(/^\/\/ @run-at\s+document-idle$/m)
  expect([...header[0].matchAll(/^\/\/ @match\s+(.+)$/gm)].map((match) => match[1])).toEqual([
    "https://www.ptt.cc/bbs/*/M.*.html",
    "https://ptt.cc/bbs/*/M.*.html",
  ])
  const installUrl =
    "https://raw.githubusercontent.com/narumiruna/userscripts/main/src/ptt-auto-media/ptt-auto-media.user.js"
  for (const field of ["downloadURL", "updateURL"]) {
    expect(source.match(new RegExp(`^// @${field}\\s+(.+)$`, "m"))?.[1]).toBe(installUrl)
  }
  expect(() => new Script(source)).not.toThrow()
  expect(source).not.toMatch(/\brequire\s*\(/)
  expect(source).not.toMatch(/^\s*(import|export)\s/m)
  expect(source).not.toMatch(/^\/\/ @(require|resource)\s/m)
  stop = startPttAutoMedia()
  expect(window.startPttAutoMedia).toBeUndefined()
  expect(window.mediaOf).toBeUndefined()
})

test.each([
  ["https://cdn.example.com/photo.jpeg", "img", "https://cdn.example.com/photo.jpeg"],
  [
    "http://cdn.example.com/photo.JPG?size=large#part",
    "img",
    "https://cdn.example.com/photo.JPG?size=large",
  ],
  [
    "https://cdn.example.com/photo.png?width=800",
    "img",
    "https://cdn.example.com/photo.png?width=800",
  ],
  ["https://cdn.example.com/animation.gif", "img", "https://cdn.example.com/animation.gif"],
  ["https://cdn.example.com/photo.webp", "img", "https://cdn.example.com/photo.webp"],
  ["https://cdn.example.com/photo.avif", "img", "https://cdn.example.com/photo.avif"],
  ["https://cdn.example.com/photo.bmp", "img", "https://cdn.example.com/photo.bmp"],
  [
    "https://pbs.twimg.com/media/FkenHYyVQAAMSY5.jpg",
    "img",
    "https://pbs.twimg.com/media/FkenHYyVQAAMSY5.jpg",
  ],
  [
    "https://pbs.twimg.com/media/example?format=jpg&name=orig",
    "img",
    "https://pbs.twimg.com/media/example?format=jpg&name=orig",
  ],
  [
    "https://pbs.twimg.com/media/example.jpg:large",
    "img",
    "https://pbs.twimg.com/media/example.jpg:large",
  ],
  ["https://imgur.com/MiX2PsS", "img", "https://i.imgur.com/MiX2PsS.jpg"],
  ["http://www.imgur.com/MiX2PsS/", "img", "https://i.imgur.com/MiX2PsS.jpg"],
  ["https://m.imgur.com/MiX2PsS.png?tracking=1", "img", "https://i.imgur.com/MiX2PsS.png"],
  ["https://i.imgur.com/1LRWpbE.jpeg", "img", "https://i.imgur.com/1LRWpbE.jpeg"],
  ["https://i.imgur.com/AbC12De.gif", "img", "https://i.imgur.com/AbC12De.gif"],
  ["https://imgur.com/AbC12De.gifv", "video", "https://i.imgur.com/AbC12De.mp4"],
  ["https://i.imgur.com/AbC12De.mp4", "video", "https://i.imgur.com/AbC12De.mp4"],
  ["https://files.example.com/movie.mp4", "video", "https://files.example.com/movie.mp4"],
  [
    "https://files.example.com/movie.webm?download=1",
    "video",
    "https://files.example.com/movie.webm?download=1",
  ],
  ["https://files.example.com/movie.ogv", "video", "https://files.example.com/movie.ogv"],
  ["https://files.example.com/movie.m4v", "video", "https://files.example.com/movie.m4v"],
  ["https://youtu.be/Zlxf0yH77PM", "iframe", "https://www.youtube-nocookie.com/embed/Zlxf0yH77PM"],
  [
    "https://www.youtube.com/watch?v=Zlxf0yH77PM&feature=share",
    "iframe",
    "https://www.youtube-nocookie.com/embed/Zlxf0yH77PM",
  ],
  [
    "https://m.youtube.com/shorts/Zlxf0yH77PM",
    "iframe",
    "https://www.youtube-nocookie.com/embed/Zlxf0yH77PM",
  ],
  [
    "https://www.youtube.com/live/Zlxf0yH77PM",
    "iframe",
    "https://www.youtube-nocookie.com/embed/Zlxf0yH77PM",
  ],
  [
    "https://www.youtube.com/embed/Zlxf0yH77PM?autoplay=1",
    "iframe",
    "https://www.youtube-nocookie.com/embed/Zlxf0yH77PM",
  ],
])("embeds %s as %s", (href, tag, src) => {
  const link = addLink(href)
  const before = link.outerHTML
  stop = startPttAutoMedia()
  expect(main.querySelectorAll(PREVIEW)).toHaveLength(1)
  const preview = main.querySelector(PREVIEW)
  expect(link.nextElementSibling).toBe(preview)
  expect(preview.querySelector(tag).src).toBe(src)
  expect(link.outerHTML).toBe(before)
  if (tag === "img") {
    expect(preview.querySelector("img").parentElement.href).toBe(link.href)
    expect(preview.querySelector("img").loading).toBe("lazy")
    expect(preview.querySelector("img").decoding).toBe("async")
    expect(preview.querySelector("img").referrerPolicy).toBe("no-referrer")
  }
})

test.each([
  "javascript:alert(1)",
  "data:image/png;base64,aGVsbG8=",
  "file:///tmp/photo.jpg",
  "https://user:password@cdn.example.com/photo.jpg",
  "https://localhost/photo.jpg",
  "https://sub.localhost/photo.jpg",
  "https://127.0.0.1/photo.jpg",
  "https://[::1]/photo.jpg",
  "https://printer.local/photo.jpg",
  "https://intranet/photo.jpg",
  "https://imgur.com/a/MiX2PsS",
  "https://imgur.com/gallery/MiX2PsS",
  "https://www.youtube.com/@JK-zu6bw/",
  "https://www.youtube.com/watch?v=invalid",
  "https://youtu.be/invalid",
  "https://www.youtube.com/playlist?list=example",
  "https://youtube.com.evil.example/watch?v=Zlxf0yH77PM",
  "https://imgur.com.evil.example/AbC12De.gifv",
  "https://example.com/page?image=photo.jpg",
  "https://example.com/animation.gifv",
  "https://example.com/page.html",
])("leaves unsupported or unsafe URL %s as a link", (href) => {
  const link = addLink(href)
  stop = startPttAutoMedia()
  expect(main.querySelector(PREVIEW)).toBeNull()
  expect(main.contains(link)).toBe(true)
})

test.each(articles.map((article, index) => [index, article]))(
  "reproduces linked-media coverage for supplied article %i",
  (index, article) => {
    const links = []
    for (const entry of article.links) {
      let root = main
      if (entry.push) {
        root = document.createElement("div")
        root.className = "push"
        root.innerHTML =
          '<span class="push-userid">user</span><span class="push-content"></span><span class="push-ipdatetime">time</span>'
        main.append(root)
        root = root.querySelector(".push-content")
      }
      const link = addLink(entry.href, root)
      links.push(link)
      if (entry.native) {
        addNative(
          link,
          entry.native,
          entry.native.includes("youtube.com/embed/") ? "iframe" : "img",
        )
      }
    }
    const originals = links.map((link) => link.outerHTML)
    const native = [...main.querySelectorAll(".richcontent")]
    stop = startPttAutoMedia()
    const expected = [
      { added: 0, images: 6, frames: 0 },
      { added: 13, images: 13, frames: 0 },
      { added: 7, images: 14, frames: 1 },
      { added: 11, images: 11, frames: 0 },
    ][index]
    expect(main.querySelectorAll(PREVIEW)).toHaveLength(expected.added)
    expect(main.querySelectorAll("img")).toHaveLength(expected.images)
    expect(main.querySelectorAll("iframe")).toHaveLength(expected.frames)
    expect(links.map((link) => link.outerHTML)).toEqual(originals)
    expect([...main.querySelectorAll(".richcontent")]).toEqual(native)
    for (const push of main.querySelectorAll(".push")) {
      expect(push.querySelector(PREVIEW)).toBeNull()
      expect(push.querySelector(".push-ipdatetime").textContent).toBe("time")
    }
  },
)

test("does not autoplay or loop videos and leaves native playback controls available", () => {
  addLink("https://i.imgur.com/AbC12De.gifv")
  stop = startPttAutoMedia()
  const video = main.querySelector("video")
  expect(video.controls).toBe(true)
  expect(video.playsInline).toBe(true)
  expect(video.preload).toBe("metadata")
  expect(video.autoplay).toBe(false)
  expect(video.loop).toBe(false)
  expect(video.hasAttribute("autoplay")).toBe(false)
})

test("uses a lazy, titled, sandboxed privacy-enhanced YouTube frame without autoplay", () => {
  addLink("https://youtu.be/Zlxf0yH77PM")
  stop = startPttAutoMedia()
  const frame = main.querySelector("iframe")
  expect(frame.title).toBe("YouTube video")
  expect(frame.loading).toBe("lazy")
  expect(frame.referrerPolicy).toBe("strict-origin-when-cross-origin")
  expect(frame.allowFullscreen).toBe(true)
  expect(frame.allow).not.toContain("autoplay")
  expect(frame.getAttribute("sandbox")).not.toContain("allow-top-navigation")
})

test("keeps multiple previews after a push in source order without splitting its timestamp", () => {
  const push = document.createElement("div")
  push.className = "push"
  push.innerHTML =
    '<span class="push-userid">user</span><span class="push-content"></span><span class="push-ipdatetime">time</span>'
  main.append(push)
  const first = addLink("https://cdn.example.com/one.jpg", push.querySelector(".push-content"))
  const second = addLink("https://cdn.example.com/two.jpg", push.querySelector(".push-content"))
  const before = push.outerHTML
  stop = startPttAutoMedia()
  expect(push.outerHTML).toBe(before)
  expect(push.nextElementSibling.querySelector("img").src).toBe(first.href)
  expect(push.nextElementSibling.nextElementSibling.querySelector("img").src).toBe(second.href)
})

test.each([
  ["https://cdn.example.com/photo.jpg", "https://cdn.example.com/photo.jpg", "img"],
  ["https://imgur.com/MiX2PsS", "https://i.imgur.com/MiX2PsS.jpg", "img"],
  ["https://youtu.be/Zlxf0yH77PM", "https://www.youtube.com/embed/Zlxf0yH77PM", "iframe"],
])("reuses an adjacent native embed for %s", (href, src, tag) => {
  const link = addLink(href)
  const native = addNative(link, src, tag)
  stop = startPttAutoMedia()
  expect(main.querySelector(PREVIEW)).toBeNull()
  expect(link.nextElementSibling).toBe(native)
})

test.each([
  ["https://cdn.example.com/photo.jpg", "https://cdn.example.com/photo.jpg", "img"],
  ["https://youtu.be/Zlxf0yH77PM", "https://www.youtube.com/embed/Zlxf0yH77PM", "iframe"],
])("reuses PTT's native push embed for %s", (href, src, tag) => {
  const push = document.createElement("div")
  push.className = "push"
  push.innerHTML = '<span class="push-content"></span><span class="push-ipdatetime">time</span>'
  main.append(push)
  const link = addLink(href, push.querySelector(".push-content"))
  const native = addNative(link, src, tag)
  const before = push.outerHTML
  stop = startPttAutoMedia()
  expect(main.querySelector(PREVIEW)).toBeNull()
  expect(push.nextElementSibling).toBe(native)
  expect(push.outerHTML).toBe(before)
  expect(main.querySelectorAll(tag)).toHaveLength(1)
})

test.each([
  ["https://cdn.example.com/photo.jpg", "img"],
  ["https://youtu.be/Zlxf0yH77PM", "iframe"],
])("reuses a late push embed and restores a removed native embed for %s", async (href, tag) => {
  const push = document.createElement("div")
  push.className = "push"
  main.append(push)
  const link = addLink(href, push)
  stop = startPttAutoMedia()
  expect(main.querySelectorAll(PREVIEW)).toHaveLength(1)
  const native = addNative(link, href, tag)
  await tick()
  expect(main.querySelector(PREVIEW)).toBeNull()
  expect(main.querySelectorAll(tag)).toHaveLength(1)
  native.remove()
  await tick()
  expect(main.querySelectorAll(PREVIEW)).toHaveLength(1)
  expect(main.querySelectorAll(tag)).toHaveLength(1)
})

test("matches each native embed in a contiguous push-media group", () => {
  const push = document.createElement("div")
  push.className = "push"
  main.append(push)
  const first = addLink("https://cdn.example.com/one.jpg", push)
  const second = addLink("https://cdn.example.com/two.jpg", push)
  addNative(first)
  addNative(second)
  stop = startPttAutoMedia()
  expect(main.querySelector(PREVIEW)).toBeNull()
  expect(main.querySelectorAll("img")).toHaveLength(2)
})

test("reuses a native video with a source child", () => {
  const link = addLink("https://cdn.example.com/movie.mp4")
  const native = document.createElement("div")
  native.className = "richcontent"
  native.innerHTML = '<video controls><source src="https://cdn.example.com/movie.mp4"></video>'
  link.after(native)
  stop = startPttAutoMedia()
  expect(main.querySelector(PREVIEW)).toBeNull()
  expect(main.querySelectorAll("video")).toHaveLength(1)
})

test("does not confuse an unrelated native image with this link", () => {
  const link = addLink("https://cdn.example.com/one.jpg")
  addNative(link, "https://cdn.example.com/two.jpg")
  stop = startPttAutoMedia()
  expect(main.querySelectorAll(PREVIEW)).toHaveLength(1)
})

test("does not treat a distant native image as the preview for repeated source links", () => {
  const first = addLink("https://cdn.example.com/photo.jpg")
  addNative(first)
  const second = addLink(first.href)
  stop = startPttAutoMedia()
  expect(second.nextElementSibling.matches(PREVIEW)).toBe(true)
  expect(main.querySelectorAll("img")).toHaveLength(2)
})

test("does not embed links inside existing rich content or existing image links", () => {
  const native = document.createElement("div")
  native.className = "richcontent"
  main.append(native)
  addLink("https://cdn.example.com/one.jpg", native)
  addLink("https://cdn.example.com/two.jpg").append(document.createElement("img"))
  stop = startPttAutoMedia()
  expect(main.querySelector(PREVIEW)).toBeNull()
})

test("does not duplicate previews or schedule an endless observer refresh", async () => {
  addLink("https://cdn.example.com/photo.jpg")
  stop = startPttAutoMedia()
  startPttAutoMedia()()
  main.append(document.createElement("div"))
  await tick(500)
  expect(main.querySelectorAll(PREVIEW)).toHaveLength(1)
  expect(document.querySelectorAll("#ptt-auto-media-style")).toHaveLength(1)
  expect(vi.getTimerCount()).toBe(0)
})

test("handles added links, href changes, and links changed to nonmedia", async () => {
  stop = startPttAutoMedia()
  const link = addLink("https://cdn.example.com/one.jpg")
  await tick()
  expect(main.querySelector("img").src).toBe(link.href)
  link.href = "https://cdn.example.com/two.mp4"
  await tick()
  expect(main.querySelector("img")).toBeNull()
  expect(main.querySelector("video").src).toBe(link.href)
  link.href = "https://example.com/article"
  await tick()
  expect(main.querySelector(PREVIEW)).toBeNull()
})

test.each(["link", "href", "main"])("removes orphan previews after %s removal", async (part) => {
  const link = addLink("https://cdn.example.com/one.jpg")
  stop = startPttAutoMedia()
  const preview = main.querySelector(PREVIEW)
  if (part === "link") link.remove()
  if (part === "href") link.removeAttribute("href")
  if (part === "main") main.remove()
  await tick()
  expect(preview.isConnected).toBe(false)
  expect(preview.querySelector("img").hasAttribute("src")).toBe(false)
})

test("waits for an article inserted later and ignores links outside the article", async () => {
  main.remove()
  addLink("https://cdn.example.com/outside.jpg", document.body)
  stop = startPttAutoMedia()
  expect(document.querySelector(PREVIEW)).toBeNull()
  main = document.createElement("div")
  main.id = "main-content"
  document.body.append(main)
  addLink("https://cdn.example.com/inside.jpg")
  await tick()
  expect(main.querySelectorAll(PREVIEW)).toHaveLength(1)
})

test("replaces a removed preview without duplicates", async () => {
  addLink("https://cdn.example.com/photo.jpg")
  stop = startPttAutoMedia()
  main.querySelector(PREVIEW).remove()
  await tick()
  expect(main.querySelectorAll(PREVIEW)).toHaveLength(1)
})

test("removes its preview when PTT adds a native embed later", async () => {
  const link = addLink("https://cdn.example.com/photo.jpg")
  stop = startPttAutoMedia()
  addNative(link)
  await tick()
  expect(main.querySelector(PREVIEW)).toBeNull()
  expect(main.querySelectorAll("img")).toHaveLength(1)
})

test.each([
  ["https://cdn.example.com/photo.jpg", "img", "load"],
  ["https://cdn.example.com/movie.mp4", "video", "loadedmetadata"],
  ["https://youtu.be/Zlxf0yH77PM", "iframe", "load"],
])("shows an accessible fallback when %s fails", (href, tag, event) => {
  const original = addLink(href)
  stop = startPttAutoMedia()
  const preview = main.querySelector(PREVIEW)
  const element = preview.querySelector(tag)
  element.dispatchEvent(new Event("error"))
  expect(preview.dataset.state).toBe("error")
  expect(element.hidden).toBe(true)
  const status = preview.querySelector('[role="status"]')
  expect(status.hidden).toBe(false)
  expect(status.textContent).toContain("Media unavailable")
  expect(status.querySelector("a").href).toBe(original.href)
  expect(status.querySelector("a").rel).toContain("noopener")
  element.dispatchEvent(new Event(event))
  expect(preview.dataset.state).toBe(tag === "iframe" ? "embedded" : "ready")
  expect(status.hidden).toBe(true)
})

test("does not fetch pages, read credentials, persist state, or accept the age-confirmation form", () => {
  main.remove()
  document.body.innerHTML =
    '<form action="/ask/over18"><button name="yes" value="yes">Agree</button></form>'
  const fetch = vi.spyOn(globalThis, "fetch")
  const storage = vi.spyOn(Storage.prototype, "setItem")
  const submit = vi.spyOn(HTMLFormElement.prototype, "submit")
  const click = vi.fn()
  document.querySelector("button").addEventListener("click", click)
  stop = startPttAutoMedia()
  expect(fetch).not.toHaveBeenCalled()
  expect(storage).not.toHaveBeenCalled()
  expect(submit).not.toHaveBeenCalled()
  expect(click).not.toHaveBeenCalled()
  expect(document.querySelector(PREVIEW)).toBeNull()
})

test("cleanup stops videos, unloads generated media, restores original content, and clears timers", async () => {
  addLink("https://cdn.example.com/photo.jpg")
  addLink("https://cdn.example.com/movie.mp4")
  addLink("https://youtu.be/Zlxf0yH77PM")
  const nativeLink = addLink("https://cdn.example.com/native.jpg")
  addNative(nativeLink)
  const before = main.innerHTML
  stop = startPttAutoMedia()
  const elements = [...main.querySelectorAll(`${PREVIEW} img, ${PREVIEW} video, ${PREVIEW} iframe`)]
  main.append(document.createTextNode(""))
  stop()
  await tick()
  expect(main.innerHTML).toBe(before)
  expect(document.getElementById("ptt-auto-media-style")).toBeNull()
  for (const element of elements) expect(element.hasAttribute("src")).toBe(false)
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce()
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
