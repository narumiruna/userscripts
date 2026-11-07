import { readFileSync } from "node:fs"
import { JSDOM } from "jsdom"
import { afterEach, expect, test, vi } from "vitest"

const source = readFileSync(
  new URL("../src/e-hentai-reader/e-hentai-reader.user.js", import.meta.url),
  "utf8",
)
const preferenceKey = "eh-reader:preferences"
const progressKey = "eh-reader:progress:123"
const continuationKey = "eh-reader:continue"
const single = `<div id="i3"><a id="next" href="/s/next/123-2"><img id="img" width="1000" height="2000"></a></div>`
const multi = `<div id="pane_images">
  <div class="mimg" id="image_1" style="max-width:1000px;height:2024px"><img id="imgsrc_1" width="1000" height="2000"></div>
  <div class="mimg" id="image_2" style="max-width:600px;height:1224px"></div>
</div>`
const listing = `<a href="/g/123/gallery/"><div class="glink">Example gallery</div></a>
  <a href="https://other.example/g/123/gallery/">Foreign gallery</a>
  <a href="http://[">Invalid link</a>`
let dom
let page
let doc
let stop = () => {}

function rect(top, height, width = 1000, left = 0) {
  return { top, bottom: top + height, height, width, left, right: left + width }
}

function layout() {
  const root = doc.documentElement
  Object.defineProperties(root, {
    clientWidth: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 800 },
  })
  Object.defineProperty(doc, "scrollingElement", { configurable: true, value: root })
  for (const element of doc.querySelectorAll("#i3, #img")) {
    element.getBoundingClientRect = () => rect(100 - root.scrollTop, 2000)
  }
  const pane = doc.getElementById("pane_images")
  if (!pane) return
  Object.defineProperties(pane, {
    clientWidth: { configurable: true, value: 900 },
    clientHeight: { configurable: true, value: 700 },
  })
  pane.getBoundingClientRect = () => rect(30, 700, 900, 40)
  let top = 30
  for (const element of doc.querySelectorAll(".mimg")) {
    const pageTop = top
    const height = Number.parseFloat(element.style.height)
    const width = Number.parseFloat(element.style.maxWidth)
    element.getBoundingClientRect = () => rect(pageTop - pane.scrollTop, height, width, 40)
    const image = element.querySelector("img")
    if (image)
      image.getBoundingClientRect = () => rect(pageTop - pane.scrollTop, height - 24, width, 40)
    top += height
  }
}

function setup({
  path = "/s/token/123-1",
  hostname = "e-hentai.org",
  html,
  local = {},
  session = {},
} = {}) {
  dom = new JSDOM(
    `<!doctype html><html><head></head><body>${html ?? (path.startsWith("/mpv/") ? multi : single)}</body></html>`,
    {
      url: `https://${hostname}${path}`,
      runScripts: "outside-only",
      pretendToBeVisual: true,
    },
  )
  page = dom.window
  doc = page.document
  for (const [key, value] of Object.entries(local))
    page.localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value))
  for (const [key, value] of Object.entries(session)) page.sessionStorage.setItem(key, value)
  layout()
}

function start() {
  stop = page.eval(source)
}

function loadSecond(width = 600, height = 1200) {
  const element = doc.getElementById("image_2")
  element.style.maxWidth = `${width}px`
  element.style.height = `${height + 24}px`
  element.innerHTML = `<img id="imgsrc_2" width="${width}" height="${height}">`
  layout()
}

function reopen(path, html) {
  stop()
  const local = Object.fromEntries(Object.entries(page.localStorage))
  const session = Object.fromEntries(Object.entries(page.sessionStorage))
  const hostname = page.location.hostname
  dom.window.close()
  setup({ path, html, hostname, local, session })
  start()
}

function control(action) {
  return doc.querySelector(`#eh-reader-toolbar [data-action='${action}']`)
}

function saved(key = progressKey) {
  return JSON.parse(page.localStorage.getItem(key))
}

function flush() {
  page.dispatchEvent(new page.Event("pagehide"))
}

async function settle() {
  await Promise.resolve()
  await new Promise((resolve) => page.requestAnimationFrame(resolve))
}

afterEach(() => {
  stop()
  stop = () => {}
  dom?.window.close()
  vi.restoreAllMocks()
})

test.each(
  ["e-hentai.org", "exhentai.org"].flatMap((hostname) =>
    [false, true].flatMap((mpv) =>
      ["in", "width", "height", "reset"].map((action) => [hostname, mpv, action]),
    ),
  ),
)(
  "persists %s view preference across reload/navigation (MPV=%s, action=%s)",
  (hostname, mpv, action) => {
    const path = mpv ? "/mpv/123/gallery/" : "/s/token/123-1"
    setup({ path, hostname })
    start()
    control("in").click()
    control(action).click()
    const preference = saved(preferenceKey)
    expect(preference).toEqual({
      mode: action === "in" ? "manual" : action === "reset" ? "native" : action,
      scale: action === "in" ? expect.closeTo(1.21) : 1,
    })
    reopen(mpv ? path : "/s/next/123-2")
    expect(saved(preferenceKey)).toEqual(preference)
    expect(control("width").getAttribute("aria-pressed")).toBe(String(action === "width"))
    expect(control("height").getAttribute("aria-pressed")).toBe(String(action === "height"))
    expect(doc.querySelector("output").textContent).toBe(
      action === "in"
        ? "121%"
        : action === "reset"
          ? "100%"
          : action === "width"
            ? mpv
              ? "90%"
              : "100%"
            : mpv
              ? "31%"
              : "37%",
    )
    expect(doc.documentElement.scrollTop).toBe(0)
  },
)

test.each([
  "{",
  null,
  [],
  { mode: "other", scale: 1 },
  { mode: "manual", scale: "2" },
  { mode: "manual", scale: 0 },
  { mode: "manual", scale: 9 },
  { mode: "width" },
])("ignores invalid stored view preference %j", (preference) => {
  setup({ local: { [preferenceKey]: preference } })
  start()
  expect(doc.querySelector("output").textContent).toBe("100%")
  expect(doc.documentElement.classList.contains("eh-reader-active")).toBe(false)
})

test("saves the single-image page and relative vertical position without query strings or fragments", () => {
  setup({ path: "/s/token/123-4?example=secret#native" })
  start()
  doc.documentElement.scrollTop = 600
  doc.dispatchEvent(new page.Event("scroll"))
  flush()
  expect(saved()).toEqual({ page: 4, offset: 0.252, path: "/s/token/123-4" })
  expect(doc.getElementById("eh-reader-position").textContent).toBe("第 4 頁")
})

test("debounces reading progress and flushes the latest position", async () => {
  setup()
  const write = vi.spyOn(page.Storage.prototype, "setItem")
  start()
  for (let index = 0; index < 10; index++) {
    doc.documentElement.scrollTop = index * 10
    doc.dispatchEvent(new page.Event("scroll"))
  }
  expect(write).not.toHaveBeenCalled()
  await new Promise((resolve) => page.setTimeout(resolve, 340))
  expect(write).toHaveBeenCalledTimes(1)
  expect(saved().page).toBe(1)
  doc.documentElement.scrollTop = 500
  flush()
  expect(saved().offset).toBe(0.202)
})

test("MPV uses the visible image_N and placeholder content geometry, not the URL hash", () => {
  setup({ path: "/mpv/123/gallery/#page1" })
  start()
  const pane = doc.getElementById("pane_images")
  pane.scrollTop = 2300
  pane.dispatchEvent(new page.Event("scroll"))
  flush()
  expect(saved()).toEqual({ page: 2, offset: 280 / 1200, path: "/mpv/123/gallery/" })
  expect(doc.getElementById("eh-reader-position").textContent).toBe("第 2 頁")
})

test.each([false, true])(
  "does not jump or replace pending progress during startup, layout, scroll, or exit (MPV=%s)",
  async (mpv) => {
    const progress = { page: 9, offset: 0.6, path: "/s/old/123-9" }
    setup({
      path: mpv ? "/mpv/123/gallery/" : "/s/token/123-1",
      local: { [progressKey]: progress, [preferenceKey]: { mode: "width", scale: 1 } },
    })
    start()
    expect(saved()).toEqual(progress)
    expect(control("resume").hidden).toBe(false)
    expect(control("resume").textContent).toContain("第 9 頁")
    expect(doc.documentElement.scrollTop).toBe(0)
    if (mpv) expect(doc.getElementById("pane_images").scrollTop).toBe(0)
    page.dispatchEvent(new page.Event("resize"))
    doc.dispatchEvent(new page.Event("scroll"))
    await settle()
    flush()
    stop()
    expect(saved()).toEqual(progress)
  },
)

test("explicit resume restores a single-image offset without changing its view preference", () => {
  setup({
    path: "/s/token/123-3",
    local: {
      [progressKey]: { page: 3, offset: 0.4, path: "/s/token/123-3" },
      [preferenceKey]: { mode: "manual", scale: 1.5 },
    },
  })
  start()
  expect(doc.documentElement.scrollTop).toBe(0)
  control("resume").click()
  expect(doc.documentElement.scrollTop).toBe(896)
  expect(control("resume").hidden).toBe(true)
  expect(saved().offset).toBe(0.4)
  expect(saved(preferenceKey)).toEqual({ mode: "manual", scale: 1.5 })
})

test("cross-document resume links target only the validated saved reader path", () => {
  setup({ local: { [progressKey]: { page: 8, offset: 0.3, path: "/s/saved/123-8" } } })
  start()
  expect(control("resume").getAttribute("href")).toBe("/s/saved/123-8#eh-reader-resume")
  expect(saved().page).toBe(8)
})

test("an explicit resume URL restores once, removes only its own marker, and preserves the query", () => {
  setup({
    path: "/s/token/123-3?example=value#eh-reader-resume",
    local: { [progressKey]: { page: 3, offset: 0.4, path: "/s/token/123-3" } },
  })
  start()
  expect(doc.documentElement.scrollTop).toBe(896)
  expect(page.location.hash).toBe("")
  expect(page.location.search).toBe("?example=value")
  reopen("/s/token/123-3?example=value")
  expect(doc.documentElement.scrollTop).toBe(0)
  expect(control("resume").hidden).toBe(false)
})

test("MPV resumes through the pane and reapplies the offset after native image loading changes its size", async () => {
  setup({
    path: "/mpv/123/gallery/",
    local: { [progressKey]: { page: 2, offset: 0.5, path: "/s/saved/123-2" } },
  })
  start()
  control("resume").click()
  expect(doc.getElementById("pane_images").scrollTop).toBe(2620)
  expect(doc.documentElement.scrollTop).toBe(0)
  flush()
  expect(saved().path).toBe("/s/saved/123-2")
  loadSecond(700, 1400)
  await settle()
  expect(doc.getElementById("pane_images").scrollTop).toBe(2720)
  expect(control("resume").hidden).toBe(true)
  expect(saved()).toEqual({ page: 2, offset: 0.5, path: "/mpv/123/gallery/" })
})

test("MPV waits for a missing resume target and handles late placeholder insertion", async () => {
  setup({
    path: "/mpv/123/gallery/#eh-reader-resume",
    html: multi.replace(/\s*<div class="mimg" id="image_2"[^>]*><\/div>/, ""),
    local: { [progressKey]: { page: 2, offset: 0.5, path: "/mpv/123/gallery/" } },
  })
  start()
  expect(doc.getElementById("pane_images").scrollTop).toBe(0)
  expect(saved().page).toBe(2)
  doc
    .getElementById("pane_images")
    .insertAdjacentHTML(
      "beforeend",
      '<div class="mimg" id="image_2" style="max-width:600px;height:1224px"></div>',
    )
  layout()
  await settle()
  expect(doc.getElementById("pane_images").scrollTop).toBe(2620)
  expect(page.location.hash).toBe("#eh-reader-resume")
  loadSecond()
  await settle()
  expect(page.location.hash).toBe("")
})

test("native same-tab single-image navigation continues tracking with a destination-bound, one-use handoff", () => {
  setup({ local: { [progressKey]: { page: 1, offset: 0.4, path: "/s/token/123-1" } } })
  start()
  control("resume").click()
  const next = doc.getElementById("next")
  next.addEventListener("click", (event) => event.preventDefault())
  next.click()
  expect(page.sessionStorage.getItem(continuationKey)).toBe("/s/next/123-2")
  reopen("/s/next/123-2")
  expect(page.sessionStorage.getItem(continuationKey)).toBeNull()
  expect(control("resume").hidden).toBe(true)
  flush()
  expect(saved().page).toBe(2)
  reopen("/s/next/123-2")
  expect(control("resume").hidden).toBe(false)
})

test("a continuation for another destination cannot overwrite pending progress", () => {
  const progress = { page: 9, offset: 0.4, path: "/s/saved/123-9" }
  setup({
    path: "/s/token/123-3",
    local: { [progressKey]: progress },
    session: { [continuationKey]: "/s/token/123-2" },
  })
  start()
  flush()
  expect(saved()).toEqual(progress)
  expect(page.sessionStorage.getItem(continuationKey)).toBeNull()
})

test("view changes preserve pending progress; ordinary reading input selects the current position", () => {
  const progress = { page: 9, offset: 0.4, path: "/s/saved/123-9" }
  setup({ local: { [progressKey]: progress } })
  start()
  doc
    .getElementById("img")
    .dispatchEvent(
      new page.WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -40 }),
    )
  flush()
  expect(saved()).toEqual(progress)
  doc
    .getElementById("img")
    .dispatchEvent(new page.WheelEvent("wheel", { bubbles: true, deltaY: 40 }))
  doc.documentElement.scrollTop = 600
  doc.dispatchEvent(new page.Event("scroll"))
  flush()
  expect(saved().page).toBe(1)
  expect(saved().offset).toBe(0.252)
  expect(control("resume").hidden).toBe(true)
})

test("Start here replaces pending progress without a jump", () => {
  setup({ local: { [progressKey]: { page: 9, offset: 0.4, path: "/s/saved/123-9" } } })
  start()
  control("start").click()
  expect(saved().page).toBe(1)
  expect(doc.documentElement.scrollTop).toBe(0)
  expect(control("resume").hidden).toBe(true)
})

test.each([
  "{",
  null,
  [],
  { page: 0, offset: 0, path: "/s/token/123-1" },
  { page: 1.5, offset: 0, path: "/mpv/123/gallery/" },
  { page: 9007199254740992, offset: 0, path: "/mpv/123/gallery/" },
  { page: 1, offset: -1, path: "/s/token/123-1" },
  { page: 1, offset: 2, path: "/s/token/123-1" },
  { page: 1, offset: "0", path: "/s/token/123-1" },
  { page: 1, offset: 0, path: "https://other.example/s/token/123-1" },
  { page: 1, offset: 0, path: "/s/token/456-1" },
  { page: 1, offset: 0, path: "/s/token/123-2" },
  { page: 1, offset: 0, path: "/s/token/123-1?redirect=other" },
])("ignores corrupt or unsafe reading progress %j", (progress) => {
  setup({ local: { [progressKey]: progress } })
  start()
  expect(control("resume").hidden).toBe(true)
  expect(doc.documentElement.scrollTop).toBe(0)
})

test("missing images and offscreen pages cannot replace valid history", () => {
  const progress = { page: 1, offset: 0.4, path: "/s/token/123-1" }
  setup({ html: '<div id="i3"></div>', local: { [progressKey]: progress } })
  start()
  flush()
  expect(saved()).toEqual(progress)
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(true)
})

test("clear history affects only owned progress keys, preserves preferences, and cancels pending saves", async () => {
  setup({
    local: {
      unrelated: "keep",
      [preferenceKey]: { mode: "width", scale: 1 },
      [progressKey]: { page: 1, offset: 0.4, path: "/s/token/123-1" },
      "eh-reader:progress:456": { page: 1, offset: 0, path: "/s/token/456-1" },
    },
  })
  vi.spyOn(page, "confirm").mockReturnValue(true)
  start()
  control("start").click()
  control("clear").click()
  await settle()
  flush()
  stop()
  expect(saved()).toBeNull()
  expect(page.localStorage.getItem("eh-reader:progress:456")).toBeNull()
  expect(page.localStorage.getItem("unrelated")).toBe("keep")
  expect(saved(preferenceKey)).toEqual({ mode: "width", scale: 1 })
})

test("canceling clear history keeps the saved record", () => {
  const progress = { page: 1, offset: 0.4, path: "/s/token/123-1" }
  setup({ local: { [progressKey]: progress } })
  vi.spyOn(page, "confirm").mockReturnValue(false)
  start()
  control("clear").click()
  expect(saved()).toEqual(progress)
})

test("storage deletion in another tab cancels local progress writes without jumping", () => {
  setup()
  start()
  page.localStorage.removeItem(progressKey)
  page.dispatchEvent(new page.StorageEvent("storage", { key: progressKey, newValue: null }))
  flush()
  expect(saved()).toBeNull()
  expect(doc.documentElement.scrollTop).toBe(0)
})

test("blocked local storage leaves zoom working and reports that changes cannot be saved", () => {
  setup()
  vi.spyOn(page, "localStorage", "get").mockImplementation(() => {
    throw new Error("blocked")
  })
  vi.spyOn(page, "sessionStorage", "get").mockImplementation(() => {
    throw new Error("blocked")
  })
  start()
  control("in").click()
  flush()
  expect(doc.querySelector("output").textContent).toBe("110%")
  expect(doc.querySelector('[role="status"]').textContent).toContain("無法使用本機儲存")
})

test("storage quota failures do not break fit controls or cleanup", () => {
  setup()
  vi.spyOn(page.Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota")
  })
  start()
  control("height").click()
  flush()
  expect(control("height").getAttribute("aria-pressed")).toBe("true")
  expect(doc.querySelector('[role="status"]').textContent).toContain("變更不會保存")
  expect(() => stop()).not.toThrow()
})

test.each(["/", "/favorites.php", "/?f_search=example", "/g/123/gallery/?p=4"])(
  "shows a read-only resume indicator on %s",
  (path) => {
    setup({
      path,
      html: path.startsWith("/g/") ? '<h1 id="gn">Example gallery</h1>' : listing,
      local: { [progressKey]: { page: 8, offset: 0.3, path: "/s/saved/123-8" } },
    })
    const write = vi.spyOn(page.Storage.prototype, "setItem")
    start()
    const badges = doc.querySelectorAll(".eh-reader-progress")
    expect(badges).toHaveLength(1)
    expect(badges[0].textContent).toBe("繼續閱讀：第 8 頁")
    expect(badges[0].getAttribute("href")).toBe("/s/saved/123-8#eh-reader-resume")
    expect(badges[0].parentElement.closest("a")).toBeNull()
    const key = new page.KeyboardEvent("keydown", { key: "+", bubbles: true, cancelable: true })
    doc.body.dispatchEvent(key)
    expect(key.defaultPrevented).toBe(false)
    expect(write).not.toHaveBeenCalled()
  },
)

test("updates dynamic gallery results and cross-tab changes without duplicate badges or observer loops", async () => {
  setup({
    path: "/",
    html: listing,
    local: { [progressKey]: { page: 8, offset: 0.3, path: "/s/saved/123-8" } },
  })
  start()
  doc.body.insertAdjacentHTML("beforeend", '<a href="/g/456/other/">Another gallery</a>')
  page.localStorage.setItem(
    "eh-reader:progress:456",
    JSON.stringify({ page: 2, offset: 0.1, path: "/mpv/456/other/" }),
  )
  await settle()
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(2)
  page.localStorage.setItem(
    progressKey,
    JSON.stringify({ page: 9, offset: 0.3, path: "/s/saved/123-9" }),
  )
  page.dispatchEvent(
    new page.StorageEvent("storage", {
      key: progressKey,
      newValue: page.localStorage.getItem(progressKey),
    }),
  )
  await settle()
  expect(doc.querySelector(".eh-reader-progress").textContent).toContain("第 9 頁")
  await settle()
  const request = vi.spyOn(page, "requestAnimationFrame")
  await new Promise((resolve) => page.setTimeout(resolve, 40))
  expect(request).not.toHaveBeenCalled()
  const duplicateStop = page.eval(source)
  duplicateStop()
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(2)
  vi.spyOn(page, "confirm").mockReturnValue(true)
  doc.querySelector("#eh-reader-toolbar button").click()
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(0)
  stop()
  page.dispatchEvent(new page.StorageEvent("storage", { key: progressKey }))
  await Promise.resolve()
  expect(doc.getElementById("eh-reader-toolbar")).toBeNull()
})

test("a newer record from another tab pauses stale lifecycle writes without jumping", () => {
  setup()
  start()
  flush()
  const progress = { page: 9, offset: 0.4, path: "/s/newer/123-9" }
  page.localStorage.setItem(progressKey, JSON.stringify(progress))
  page.dispatchEvent(
    new page.StorageEvent("storage", { key: progressKey, newValue: JSON.stringify(progress) }),
  )
  flush()
  expect(saved()).toEqual(progress)
  expect(control("resume").textContent).toContain("第 9 頁")
  expect(doc.documentElement.scrollTop).toBe(0)
  control("start").click()
  expect(saved().page).toBe(1)
})

test.each([{ key: " ", shiftKey: true }, { key: "W" }, { key: "2", code: "Numpad2" }])(
  "native reading keys %j enable current-position tracking",
  (options) => {
    setup({ local: { [progressKey]: { page: 9, offset: 0.4, path: "/s/saved/123-9" } } })
    start()
    doc.body.dispatchEvent(
      new page.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...options }),
    )
    flush()
    expect(saved().page).toBe(1)
  },
)

test.each(["ctrlKey", "metaKey", "shiftKey", "altKey"])(
  "resume preserves native %s-click navigation",
  (modifier) => {
    const progress = { page: 1, offset: 0.4, path: "/s/token/123-1" }
    setup({ local: { [progressKey]: progress } })
    start()
    const event = new page.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      [modifier]: true,
    })
    const resume = control("resume")
    let prevented
    doc.addEventListener(
      "click",
      (event) => {
        // Prevent jsdom navigation after the toolbar handler has had its turn.
        prevented = event.defaultPrevented
        event.preventDefault()
      },
      { once: true },
    )
    resume.dispatchEvent(event)
    expect(prevented).toBe(false)
    expect(doc.documentElement.scrollTop).toBe(0)
    flush()
    expect(saved()).toEqual(progress)
  },
)

test("gallery indicators recover when the site removes their sibling badge", async () => {
  setup({
    path: "/",
    html: listing,
    local: { [progressKey]: { page: 8, offset: 0.3, path: "/s/saved/123-8" } },
  })
  start()
  doc.querySelector(".eh-reader-progress").remove()
  await settle()
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(1)
  expect(doc.querySelector(".glink").parentElement.nextElementSibling.className).toBe(
    "eh-reader-progress",
  )
})

test("same-document single-reader navigation updates page identity before the next save", async () => {
  setup()
  start()
  flush()
  const next = doc.getElementById("next")
  next.addEventListener("click", (event) => event.preventDefault())
  next.click()
  page.history.pushState(null, "", "/s/next/123-2")
  doc.getElementById("img").setAttribute("width", "900")
  await settle()
  flush()
  expect(saved().page).toBe(2)
  expect(saved().path).toBe("/s/next/123-2")
  expect(doc.getElementById("eh-reader-position").textContent).toBe("第 2 頁")
  expect(page.sessionStorage.getItem(continuationKey)).toBeNull()
})

test("lifecycle saves recheck the current pathname even before the observer frame", () => {
  setup()
  start()
  page.history.replaceState(null, "", "/s/next/123-7")
  flush()
  expect(saved().page).toBe(7)
  expect(saved().path).toBe("/s/next/123-7")
  page.history.replaceState(null, "", "/g/123/gallery/")
  flush()
  expect(saved().page).toBe(7)
})

test("same-document navigation to a different gallery preserves that gallery's pending record", () => {
  const progress = { page: 8, offset: 0.3, path: "/s/saved/456-8" }
  setup({ local: { "eh-reader:progress:456": progress } })
  start()
  page.history.pushState(null, "", "/s/next/456-2")
  flush()
  expect(saved("eh-reader:progress:456")).toEqual(progress)
  expect(control("resume").textContent).toContain("第 8 頁")
})

test("starting here cancels a deferred resume marker before the target appears", async () => {
  setup({
    path: "/mpv/123/gallery/#eh-reader-resume",
    html: multi.replace(/\s*<div class="mimg" id="image_2"[^>]*><\/div>/, ""),
    local: { [progressKey]: { page: 2, offset: 0.5, path: "/mpv/123/gallery/" } },
  })
  start()
  control("start").click()
  expect(page.location.hash).toBe("")
  doc
    .getElementById("pane_images")
    .insertAdjacentHTML(
      "beforeend",
      '<div class="mimg" id="image_2" style="max-width:600px;height:1224px"></div>',
    )
  layout()
  await settle()
  expect(doc.getElementById("pane_images").scrollTop).toBe(0)
  expect(saved().page).toBe(1)
})
