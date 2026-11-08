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
  <a class="glink" href="https://other.example/g/123/gallery/">Foreign gallery</a>
  <a class="glink" href="http://[">Invalid link</a>`
const pagination = `<table class="ptt"><tbody><tr>
  <td><a href="/g/123/gallery/">&lt;</a></td>
  <td><a href="/g/123/gallery/">1</a></td>
  <td><a href="/g/123/gallery/?p=1">2</a></td>
  <td><a href="/g/123/gallery/?p=1">&gt;</a></td>
</tr></tbody></table>`
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

function expectPosition(number) {
  const position = doc.getElementById("eh-reader-position")
  expect(position.textContent.trim()).toBe(String(number))
  expect(position.getAttribute("aria-label")).toBe(`第 ${number} 頁`)
  expect(position.title).toBe(`第 ${number} 頁`)
  expect(position.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  expect(position.querySelector("svg")?.getAttribute("focusable")).toBe("false")
}

function expectPendingResume(number, href) {
  const resume = control("resume")
  const group = resume.closest(".eh-reader-resume-group")
  expect(group).not.toBeNull()
  expect(group.hidden).toBe(number === null)
  expect(resume.hidden).toBe(number === null)
  expect(control("start").hidden).toBe(number === null)
  expect(resume.textContent.trim()).toBe("")
  if (number !== null) {
    expect(resume.getAttribute("aria-label")).toBe(`繼續閱讀：第 ${number} 頁`)
    expect(resume.getAttribute("href")).toBe(href)
  }
}

function expectGalleryResume(number, href) {
  const resume = control("resume")
  expect(resume.tagName).toBe("A")
  expect(resume.hidden).toBe(number === null)
  expect(resume.closest(".eh-reader-resume-group").hidden).toBe(number === null)
  if (number !== null) {
    expect(resume.querySelector(".eh-reader-page-badge").textContent).toBe(String(number))
    expect(resume.getAttribute("aria-label")).toBe(`繼續閱讀：第 ${number} 頁`)
    expect(resume.getAttribute("href")).toBe(href)
  }
}

function changeProgress(progress, key = progressKey) {
  const newValue = progress === null ? null : JSON.stringify(progress)
  if (newValue === null) page.localStorage.removeItem(key)
  else page.localStorage.setItem(key, newValue)
  page.dispatchEvent(new page.StorageEvent("storage", { key, newValue }))
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
  expectPosition(4)
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
  expectPosition(2)
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
    expectPendingResume(
      9,
      mpv ? "/mpv/123/gallery/#eh-reader-resume" : "/s/old/123-9#eh-reader-resume",
    )
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

test.each([false, true])(
  "updates icon-only pending resume controls after cross-tab changes (MPV=%s)",
  async (mpv) => {
    setup({ path: mpv ? "/mpv/123/gallery/" : "/s/token/123-1" })
    start()
    expectPendingResume(null)
    const write = vi.spyOn(page.Storage.prototype, "setItem")
    for (const number of [8, 12]) {
      const progress = { page: number, offset: 0.3, path: `/s/saved/123-${number}` }
      page.localStorage.setItem(progressKey, JSON.stringify(progress))
      write.mockClear()
      page.dispatchEvent(
        new page.StorageEvent("storage", { key: progressKey, newValue: JSON.stringify(progress) }),
      )
      await settle()
      expectPendingResume(number, `${mpv ? "/mpv/123/gallery/" : progress.path}#eh-reader-resume`)
      expect(control("resume").querySelector("svg")).not.toBeNull()
      expect(control("start").closest(".eh-reader-resume-group")).toBe(
        control("resume").closest(".eh-reader-resume-group"),
      )
      control("resume").focus()
      const tooltip = doc.getElementById("eh-reader-tooltip")
      expect(tooltip.hidden).toBe(false)
      expect(tooltip.querySelector("span").textContent).toBe(`繼續閱讀：第 ${number} 頁`)
      expect(tooltip.querySelector("kbd").hidden).toBe(true)
      flush()
      expect(write).not.toHaveBeenCalled()
      expect(saved()).toEqual(progress)
      expect(doc.documentElement.scrollTop).toBe(0)
      if (mpv) expect(doc.getElementById("pane_images").scrollTop).toBe(0)
    }
    page.localStorage.removeItem(progressKey)
    page.dispatchEvent(new page.StorageEvent("storage", { key: progressKey, newValue: null }))
    await settle()
    expectPendingResume(null)
    expect(doc.getElementById("eh-reader-tooltip").hidden).toBe(true)
    flush()
    expect(write).not.toHaveBeenCalled()
  },
)

test.each(["resume", "start", "clear"])(
  "nested SVG clicks delegate the %s action and update the pending group",
  async (action) => {
    setup({ local: { [progressKey]: { page: 1, offset: 0.4, path: "/s/token/123-1" } } })
    const confirm = vi.spyOn(page, "confirm").mockImplementation(() => {
      expect(doc.getElementById("eh-reader-tooltip").hidden).toBe(true)
      return true
    })
    start()
    const target = control(action)
    target.focus()
    expect(doc.getElementById("eh-reader-tooltip").hidden).toBe(false)
    const icon = target.querySelector("svg")
    expect(icon).not.toBeNull()
    const nested = icon.firstElementChild ?? icon
    nested.dispatchEvent(new page.MouseEvent("click", { bubbles: true, cancelable: true }))
    await settle()
    expectPendingResume(null)
    if (action === "resume") expect(doc.documentElement.scrollTop).toBe(896)
    else expect(doc.documentElement.scrollTop).toBe(0)
    if (action === "clear") {
      expect(confirm).toHaveBeenCalledTimes(1)
      expect(saved()).toBeNull()
      const status = doc.querySelector('[role="status"]')
      expect(status.textContent).toContain("已清除本站閱讀紀錄")
      expect(status.hidden).toBe(false)
      expect(page.getComputedStyle(status).position).toBe("fixed")
    } else {
      expect(confirm).not.toHaveBeenCalled()
      expect(doc.getElementById("eh-reader-tooltip").hidden).toBe(true)
      expect(saved().page).toBe(1)
    }
  },
)

test("clear notices expire and cleanup cancels the pending popup timer", () => {
  setup()
  vi.spyOn(page, "confirm").mockReturnValue(true)
  start()
  vi.useFakeTimers()
  try {
    const timer = vi.spyOn(page, "setTimeout")
    const cancel = vi.spyOn(page, "clearTimeout")
    const status = doc.querySelector('[role="status"]')
    control("clear").click()
    expect(status.textContent).toContain("已清除本站閱讀紀錄")
    vi.advanceTimersByTime(2799)
    expect(status.textContent).toContain("已清除本站閱讀紀錄")
    vi.advanceTimersByTime(1)
    expect(status.textContent).toBe("")
    control("clear").click()
    const index = timer.mock.calls.findLastIndex(([, delay]) => delay === 2800)
    expect(index).toBeGreaterThanOrEqual(0)
    const pendingTimer = timer.mock.results[index].value
    stop()
    expect(cancel).toHaveBeenCalledWith(pendingTimer)
    const text = status.textContent
    vi.advanceTimersByTime(3000)
    expect(status.textContent).toBe(text)
    expect(status.isConnected).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

test("storage failure notices remain readable after the transient notice timeout", () => {
  setup()
  vi.spyOn(page.Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota")
  })
  start()
  vi.useFakeTimers()
  try {
    control("in").click()
    flush()
    const status = doc.querySelector('[role="status"]')
    expect(status.textContent).toContain("變更不會保存")
    vi.advanceTimersByTime(3000)
    expect(status.textContent).toContain("變更不會保存")
    expect(page.getComputedStyle(status).display).not.toBe("none")
    stop()
  } finally {
    vi.useRealTimers()
  }
})

test("canceling a nested clear icon click preserves the pending group", () => {
  const progress = { page: 8, offset: 0.3, path: "/s/saved/123-8" }
  setup({ local: { [progressKey]: progress } })
  const confirm = vi.spyOn(page, "confirm").mockReturnValue(false)
  start()
  control("clear")
    .querySelector("svg")
    .dispatchEvent(new page.MouseEvent("click", { bubbles: true, cancelable: true }))
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(saved()).toEqual(progress)
  expectPendingResume(8, "/s/saved/123-8#eh-reader-resume")
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
  const status = doc.querySelector('[role="status"]')
  expect(status.textContent).toContain("無法使用本機儲存")
  expect(status.hidden).toBe(false)
  expect(page.getComputedStyle(status).position).toBe("fixed")
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

test.each(["/", "/favorites.php", "/?f_search=example"])(
  "shows a read-only resume indicator on %s",
  (path) => {
    setup({
      path,
      html: listing,
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
  doc.body.insertAdjacentHTML(
    "beforeend",
    '<a href="/g/456/other/"><div class="glink">Another gallery</div></a>',
  )
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
  expect(control("resume").getAttribute("aria-label")).toBe("繼續閱讀：第 9 頁")
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
  "the resume icon preserves native %s-click navigation",
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
    const icon = resume.querySelector("svg")
    expect(icon).not.toBeNull()
    const nested = icon.firstElementChild ?? icon
    nested.dispatchEvent(event)
    expect(prevented).toBe(false)
    expect(doc.documentElement.scrollTop).toBe(0)
    flush()
    expect(saved()).toEqual(progress)
  },
)

test.each(["e-hentai.org", "exhentai.org"])(
  "keeps both gallery pagination tables and navigation links unchanged on %s",
  (hostname) => {
    setup({
      path: "/g/123/gallery/?p=1",
      hostname,
      html: `<h1 id="gn">Example gallery</h1>${pagination}<div id="gdt">Thumbnails</div>${pagination}<a id="navigation" href="/g/123/gallery/?p=0">Return to gallery</a>`,
      local: { [progressKey]: { page: 5, offset: 0.3, path: "/s/saved/123-5" } },
    })
    const tables = [...doc.querySelectorAll(".ptt")].map((table) => table.outerHTML)
    start()
    expect([...doc.querySelectorAll(".ptt")].map((table) => table.outerHTML)).toEqual(tables)
    expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(0)
    expect(doc.getElementById("gn").nextElementSibling.matches(".ptt")).toBe(true)
    expectGalleryResume(5, "/s/saved/123-5#eh-reader-resume")
    expect(
      doc.getElementById("navigation").nextElementSibling?.matches(".eh-reader-progress"),
    ).not.toBe(true)
    expect(doc.getElementById("navigation").getAttribute("href")).toBe("/g/123/gallery/?p=0")
    expect(doc.getElementById("navigation").textContent).toBe("Return to gallery")
  },
)

test("shows the gallery dock without a title and leaves pagination unchanged", () => {
  setup({
    path: "/g/123/gallery/",
    html: pagination,
    local: { [progressKey]: { page: 5, offset: 0.3, path: "/s/saved/123-5" } },
  })
  const before = doc.querySelector(".ptt").outerHTML
  start()
  expect(doc.querySelector(".ptt").outerHTML).toBe(before)
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(0)
  expectGalleryResume(5, "/s/saved/123-5#eh-reader-resume")
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(false)
})

test.each([
  '<a href="/g/123/gallery/"><div class="glink">Example gallery</div></a>',
  '<a href="/g/123/gallery/"><span class="glink">Example gallery</span></a>',
  '<a class="glink" href="/g/123/gallery/">Example gallery</a>',
  '<a href="/g/123/gallery/"><div class="glink"><span class="glink">Example gallery</span></div></a>',
])("decorates a gallery title once without annotating its other links: %s", (title) => {
  setup({
    path: "/",
    html: `<div class="glname">${title}</div>${pagination}<a id="thumbnail" href="/g/123/gallery/">Thumbnail</a>`,
    local: { [progressKey]: { page: 5, offset: 0.3, path: "/s/saved/123-5" } },
  })
  start()
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(1)
  expect(doc.querySelector(".glname > .eh-reader-progress")).not.toBeNull()
  expect(doc.querySelector(".ptt .eh-reader-progress")).toBeNull()
  expect(
    doc.getElementById("thumbnail").nextElementSibling?.matches(".eh-reader-progress"),
  ).not.toBe(true)
})

test("updates resume indicators when a result gains or loses its native title class", async () => {
  setup({
    path: "/",
    html: '<a href="/g/123/gallery/"><span id="title">Example gallery</span></a>',
    local: { [progressKey]: { page: 5, offset: 0.3, path: "/s/saved/123-5" } },
  })
  start()
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(0)
  const title = doc.getElementById("title")
  title.classList.add("glink")
  await settle()
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(1)
  title.classList.remove("glink")
  await settle()
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(0)
})

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

test.each(["e-hentai.org", "exhentai.org"])(
  "uses only the current gallery's toolbar resume on %s, including without native title DOM",
  async (hostname) => {
    setup({
      hostname,
      path: "/g/123/gallery/?p=4",
      html: "",
      local: {
        [progressKey]: { page: 18, offset: 0.3, path: "/mpv/123/gallery/" },
        "eh-reader:progress:456": { page: 2, offset: 0, path: "/s/other/456-2" },
      },
    })
    const write = vi.spyOn(page.Storage.prototype, "setItem")
    start()
    expectGalleryResume(18, "/mpv/123/gallery/#eh-reader-resume")
    doc.body.insertAdjacentHTML(
      "afterbegin",
      `<h1 id="gn">Example gallery</h1>${listing}<a class="glink" href="/g/456/other/">Other gallery</a>`,
    )
    await settle()
    expectGalleryResume(18, "/mpv/123/gallery/#eh-reader-resume")
    const badges = doc.querySelectorAll(".eh-reader-progress")
    expect(badges).toHaveLength(1)
    expect(badges[0].getAttribute("href")).toBe("/s/other/456-2#eh-reader-resume")
    expect(badges[0].previousElementSibling.textContent).toBe("Other gallery")
    doc.getElementById("gn").replaceWith(doc.createElement("h1"))
    await settle()
    expectGalleryResume(18, "/mpv/123/gallery/#eh-reader-resume")
    expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(1)
    expect(write).not.toHaveBeenCalled()
  },
)

test.each([
  undefined,
  "{",
  null,
  [],
  { page: 0, offset: 0, path: "/s/saved/123-1" },
  { page: 1.5, offset: 0, path: "/mpv/123/gallery/" },
  { page: 9007199254740992, offset: 0, path: "/mpv/123/gallery/" },
  { page: 8, offset: -1, path: "/s/saved/123-8" },
  { page: 8, offset: 2, path: "/s/saved/123-8" },
  { page: 8, offset: "0", path: "/s/saved/123-8" },
  { page: 8, offset: 0, path: "https://other.example/s/saved/123-8" },
  { page: 8, offset: 0, path: "/s/saved/456-8" },
  { page: 8, offset: 0, path: "/s/saved/123-9" },
  { page: 8, offset: 0, path: "/s/saved/123-8?redirect=other" },
])("does not show gallery resume for absent or unsafe progress %j", (progress) => {
  setup({
    path: "/g/123/gallery/",
    html: '<h1 id="gn">Example gallery</h1>',
    local: {
      ...(progress === undefined ? {} : { [progressKey]: progress }),
      "eh-reader:progress:456": { page: 2, offset: 0, path: "/s/other/456-2" },
    },
  })
  const write = vi.spyOn(page.Storage.prototype, "setItem")
  start()
  expectGalleryResume(null)
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(true)
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(0)
  expect(write).not.toHaveBeenCalled()
})

test.each(["/", "/favorites.php", "/?f_search=example"])(
  "keeps title text badges and never selects a global resume target on %s",
  (path) => {
    setup({
      path,
      html: `${listing}<a class="glink" href="/g/456/other/">Other gallery</a>`,
      local: {
        [progressKey]: { page: 8, offset: 0.3, path: "/s/saved/123-8" },
        "eh-reader:progress:456": { page: 2, offset: 0, path: "/mpv/456/other/" },
      },
    })
    start()
    expect(control("resume")?.hidden ?? true).toBe(true)
    expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(2)
    expect(
      [...doc.querySelectorAll(".eh-reader-progress")].map((badge) => badge.textContent),
    ).toEqual(["繼續閱讀：第 8 頁", "繼續閱讀：第 2 頁"])
    expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(false)
    expect(control("clear").getAttribute("aria-label")).toBe("清除閱讀紀錄")
    expect(control("clear").textContent.trim()).toBe("")
    expect(control("clear").querySelector("svg")).not.toBeNull()
  },
)

test("cross-tab gallery progress updates the numeric badge, href and open tooltip, then hides the dock", async () => {
  setup({ path: "/g/123/gallery/", html: "" })
  start()
  expectGalleryResume(null)
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(true)
  for (const [number, path] of [
    [8, "/s/saved/123-8"],
    [123, "/mpv/123/gallery/"],
  ]) {
    changeProgress({ page: number, offset: 0.3, path })
    await settle()
    expectGalleryResume(number, `${path}#eh-reader-resume`)
    expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(false)
    control("resume").focus()
    const tooltip = doc.getElementById("eh-reader-tooltip")
    expect(tooltip.hidden).toBe(false)
    expect(tooltip.querySelector("span").textContent).toBe(`繼續閱讀：第 ${number} 頁`)
    expect(tooltip.querySelector("kbd").hidden).toBe(true)
  }
  changeProgress(null)
  await settle()
  expectGalleryResume(null)
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(true)
  expect(doc.getElementById("eh-reader-tooltip").hidden).toBe(true)
  expect(control("resume").hasAttribute("aria-describedby")).toBe(false)
})

test("other-gallery badges keep a gallery dock visible without providing its resume target", async () => {
  setup({
    path: "/g/123/gallery/",
    html: '<a class="glink" href="/g/456/other/">Other gallery</a>',
    local: {
      [progressKey]: { page: 8, offset: 0.3, path: "/s/saved/123-8" },
      "eh-reader:progress:456": { page: 2, offset: 0, path: "/s/other/456-2" },
    },
  })
  start()
  changeProgress(null)
  await settle()
  expectGalleryResume(null)
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(false)
  expect(doc.querySelector(".eh-reader-progress").textContent).toBe("繼續閱讀：第 2 頁")
  doc.querySelector(".glink").parentElement.removeChild(doc.querySelector(".glink"))
  await settle()
  expect(doc.querySelector(".eh-reader-progress")).toBeNull()
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(true)
})

test.each([
  {},
  { ctrlKey: true },
  { metaKey: true },
  { shiftKey: true },
  { altKey: true },
  { button: 1 },
])("gallery resume retains native anchor navigation without storage writes for %j", (options) => {
  const progress = { page: 8, offset: 0.3, path: "/s/saved/123-8" }
  setup({ path: "/g/123/gallery/", html: "", local: { [progressKey]: progress } })
  start()
  const write = vi.spyOn(page.Storage.prototype, "setItem")
  const type = options.button === 1 ? "auxclick" : "click"
  const observed = vi.fn((event) => {
    expect(event.defaultPrevented).toBe(false)
    // Stop jsdom navigation only after the userscript's delegated handler runs.
    event.preventDefault()
  })
  doc.addEventListener(type, observed, { once: true })
  control("resume")
    .querySelector("svg")
    .firstElementChild.dispatchEvent(
      new page.MouseEvent(type, { bubbles: true, cancelable: true, ...options }),
    )
  expect(observed).toHaveBeenCalledTimes(1)
  flush()
  expect(write).not.toHaveBeenCalled()
  expect(saved()).toEqual(progress)
  expect(page.sessionStorage.getItem(continuationKey)).toBeNull()
  expectGalleryResume(8, "/s/saved/123-8#eh-reader-resume")
})

test.each(["/g/123/gallery/", "/?f_search=example"])(
  "clear hides the last gallery/list record on %s but leaves its 2800 ms notice outside the dock",
  (path) => {
    setup({
      path,
      html: listing,
      local: {
        [progressKey]: { page: 8, offset: 0.3, path: "/s/saved/123-8" },
        "eh-reader:progress:456": { page: 2, offset: 0, path: "/s/other/456-2" },
        [preferenceKey]: { mode: "width", scale: 1 },
        "eh-reader:progressive:unrelated": "keep",
        unrelated: "keep",
      },
    })
    const confirm = vi.spyOn(page, "confirm").mockReturnValue(true)
    start()
    vi.useFakeTimers()
    try {
      const toolbar = doc.getElementById("eh-reader-toolbar")
      const status = doc.getElementById("eh-reader-status")
      control("clear").focus()
      control("clear")
        .querySelector("svg")
        .firstElementChild.dispatchEvent(
          new page.MouseEvent("click", { bubbles: true, cancelable: true }),
        )
      expect(confirm).toHaveBeenCalledTimes(1)
      expect(saved()).toBeNull()
      expect(saved("eh-reader:progress:456")).toBeNull()
      expect(saved(preferenceKey)).toEqual({ mode: "width", scale: 1 })
      expect(page.localStorage.getItem("eh-reader:progressive:unrelated")).toBe("keep")
      expect(page.localStorage.getItem("unrelated")).toBe("keep")
      expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(0)
      expect(toolbar.hidden).toBe(true)
      expect(doc.getElementById("eh-reader-tooltip").hidden).toBe(true)
      expect(status.parentElement).toBe(toolbar.parentElement)
      expect(toolbar.contains(status)).toBe(false)
      expect(status.getAttribute("role")).toBe("status")
      expect(status.classList.contains("eh-reader-status")).toBe(true)
      expect(status.hidden).toBe(false)
      expect(status.textContent).toContain("已清除本站閱讀紀錄")
      expect(page.getComputedStyle(status).position).toBe("fixed")
      expect(page.getComputedStyle(status).display).not.toBe("none")
      vi.advanceTimersByTime(2799)
      expect(status.textContent).toContain("已清除本站閱讀紀錄")
      vi.advanceTimersByTime(1)
      expect(status.textContent).toBe("")
      expect(toolbar.hidden).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  },
)

test.each([false, true])(
  "gallery clear preserves progress when deletion is canceled or fails (failure=%s)",
  async (failure) => {
    const progress = { page: 8, offset: 0.3, path: "/s/saved/123-8" }
    setup({ path: "/g/123/gallery/", html: "", local: { [progressKey]: progress } })
    vi.spyOn(page, "confirm").mockReturnValue(failure)
    const remove = vi.spyOn(page.Storage.prototype, "removeItem")
    if (failure)
      remove.mockImplementation(() => {
        throw new Error("blocked")
      })
    start()
    control("clear").click()
    await settle()
    expect(saved()).toEqual(progress)
    expectGalleryResume(8, "/s/saved/123-8#eh-reader-resume")
    expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(false)
    const status = doc.getElementById("eh-reader-status")
    expect(status.textContent).not.toContain("已清除本站閱讀紀錄")
    if (failure) {
      expect(status.textContent).toContain("無法使用本機儲存")
      expect(status.hidden).toBe(false)
      expect(status.closest("#eh-reader-toolbar")).toBeNull()
      expect(page.getComputedStyle(doc.getElementById("eh-reader-toolbar")).width).toBe("64px")
    } else expect(remove).not.toHaveBeenCalled()
  },
)

test("a gallery storage error remains readable without saved progress or a wide dock", () => {
  setup({ path: "/g/123/gallery/", html: "" })
  vi.spyOn(page, "localStorage", "get").mockImplementation(() => {
    throw new Error("blocked")
  })
  start()
  vi.useFakeTimers()
  try {
    const toolbar = doc.getElementById("eh-reader-toolbar")
    const status = doc.getElementById("eh-reader-status")
    expect(toolbar.hidden).toBe(false)
    expectGalleryResume(null)
    expect(status.textContent).toContain("無法使用本機儲存")
    expect(status.hidden).toBe(false)
    expect(status.parentElement).toBe(toolbar.parentElement)
    expect(page.getComputedStyle(toolbar).width).toBe("64px")
    vi.advanceTimersByTime(3000)
    expect(status.textContent).toContain("無法使用本機儲存")
    expect(page.getComputedStyle(status).display).not.toBe("none")
  } finally {
    vi.useRealTimers()
  }
})

test("dynamic result href and title changes update badges and dock visibility without choosing a global resume", async () => {
  setup({
    path: "/favorites.php",
    html: '<a id="result" class="glink" href="/g/123/gallery/">Gallery title</a>',
    local: {
      [progressKey]: { page: 8, offset: 0.3, path: "/s/saved/123-8" },
      "eh-reader:progress:456": { page: 2, offset: 0, path: "/mpv/456/other/" },
    },
  })
  start()
  const result = doc.getElementById("result")
  result.href = "/g/456/other/"
  await settle()
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(1)
  expect(doc.querySelector(".eh-reader-progress").getAttribute("href")).toBe(
    "/mpv/456/other/#eh-reader-resume",
  )
  result.textContent = ""
  await settle()
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(0)
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(true)
  result.textContent = "Restored title"
  await settle()
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(1)
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(false)
  result.href = "https://other.example/g/456/other/"
  await settle()
  expect(doc.querySelectorAll(".eh-reader-progress")).toHaveLength(0)
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(true)
  expect(control("resume")?.hidden ?? true).toBe(true)
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
  expectPosition(2)
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
  expect(control("resume").getAttribute("aria-label")).toBe("繼續閱讀：第 8 頁")
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
