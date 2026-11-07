import { readFileSync } from "node:fs"
import { Script } from "node:vm"
import { JSDOM } from "jsdom"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

const source = readFileSync(
  new URL("../src/e-hentai-reader/e-hentai-reader.user.js", import.meta.url),
  "utf8",
)
const installUrl =
  "https://raw.githubusercontent.com/narumiruna/userscripts/main/src/e-hentai-reader/e-hentai-reader.user.js"
const single = `
  <div id="i1" style="max-width: 1000px">
    <div id="i3" style="width: 1000px; text-align: center">
      <img id="img" src="/page.jpg" style="width: 1000px; height: 2000px; margin: auto">
      <img id="nav-icon" src="/next.png" style="width: 18px; height: 12px">
      <input id="input"><textarea id="textarea"></textarea><select id="select"></select>
      <div contenteditable="true"><span id="editable">text</span></div>
      <div contenteditable="false" id="not-editable">text</div>
    </div>
  </div><div id="outside">outside image</div>`
const multi = `
  <div id="pane_images" style="overflow: hidden">
    <div class="mimg" id="image_1" style="max-width: 1000px; height: 2024px">
      <img id="imgsrc_1" src="/page1.jpg" style="width: 1000px; height: 2000px; margin: auto">
      <img id="nav-icon" src="/next.png" style="width: 18px; height: 12px">
    </div>
    <div class="mimg" id="image_2" style="max-width: 600px; height: 1224px"></div>
    <div class="mimg" id="image_invalid" style="max-width: 200px; height: 424px"></div>
  </div>`
let dom
let page
let doc
let stop

function rect(left = 0, top = 0, width = 1000, height = 2000) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }
}

function setup(path = "/s/token/123-1", html = single, hostname = "e-hentai.org") {
  dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    url: `https://${hostname}${path}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  })
  page = dom.window
  doc = page.document
  Object.defineProperties(doc.documentElement, {
    clientWidth: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 800 },
  })
  const pane = doc.getElementById("pane_images")
  if (pane) {
    Object.defineProperties(pane, {
      clientWidth: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 700 },
    })
    pane.getBoundingClientRect = () => rect(40, 30, 900, 700)
  }
  for (const element of doc.querySelectorAll("#i3, .mimg, #img, [id^='imgsrc_']")) {
    element.getBoundingClientRect = () => rect()
  }
}

function start() {
  stop = page.eval(source)
  expect(stop).toBeTypeOf("function")
}

function button(action) {
  return doc.querySelector(`#eh-reader-toolbar button[data-action='${action}']`)
}

function percent() {
  return doc.querySelector("#eh-reader-toolbar output").textContent
}

function rules() {
  return [...doc.getElementById("eh-reader-style").sheet.cssRules]
}

function dimensions(id = "i3") {
  const rule = rules().find(
    (rule) => rule.selectorText === `#${id}` && rule.style.getPropertyValue("--ehr-width"),
  )
  return rule
    ? ["--ehr-width", "--ehr-height"].map((name) =>
        Number.parseFloat(rule.style.getPropertyValue(name)),
      )
    : null
}

function expectDimensions(width, height, id = "i3") {
  const actual = dimensions(id)
  expect(actual).not.toBeNull()
  expect(actual[0]).toBeCloseTo(width, 3)
  expect(actual[1]).toBeCloseTo(height, 3)
}

function wheel(options = {}, target = doc.getElementById("img")) {
  const event = new page.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY: -40,
    clientX: 250,
    clientY: 400,
    ...options,
  })
  target.dispatchEvent(event)
  return event
}

function key(key, options = {}, target = doc.body) {
  const event = new page.KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  })
  target.dispatchEvent(event)
  return event
}

async function settle() {
  // Let MutationObserver queue its frame before waiting for the visual frame.
  await Promise.resolve()
  await new Promise((resolve) => page.requestAnimationFrame(resolve))
}

beforeEach(() => {
  stop = () => {}
})

afterEach(() => {
  stop()
  dom?.window.close()
  vi.restoreAllMocks()
})

test("the exact installation source has standalone metadata and source update URLs", () => {
  const header = source.match(/^\/\/ ==UserScript==\r?\n[\s\S]*?\/\/ ==\/UserScript==/)
  expect(header).not.toBeNull()
  const values = (field) =>
    [...header[0].matchAll(new RegExp(`^// @${field}[^\\S\\r\\n]+([^\\r\\n]+)`, "gm"))].map(
      (match) => match[1].trim(),
    )
  expect(values("name")).toEqual(["E-Hentai Reader"])
  expect(values("namespace")).toEqual(["userscripts/e-hentai-reader"])
  expect(values("version")).toEqual(["0.2.1"])
  expect(values("grant")).toEqual(["none"])
  expect(values("run-at")).toEqual(["document-idle"])
  expect(values("license")).toEqual(["AGPL-3.0-only"])
  expect(header[0]).toMatch(/^\/\/ @noframes\r?$/m)
  expect(values("match")).toEqual(["https://e-hentai.org/*", "https://exhentai.org/*"])
  expect(values("downloadURL")).toEqual([installUrl])
  expect(values("updateURL")).toEqual([installUrl])
  expect(() => new Script(source)).not.toThrow()
  expect(source).not.toMatch(/^\s*(import|export)\s/m)
  expect(source).not.toMatch(/^\/\/ @(require|resource)\s/m)
})

test.each([
  ["e-hentai.org", "/s/token/123-1"],
  ["e-hentai.org", "/mpv/123/token/"],
  ["exhentai.org", "/s/token/123-1"],
  ["exhentai.org", "/mpv/123/token/"],
])("supports native size, zoom, fit, and reset on %s%s", (hostname, path) => {
  const mpv = path.startsWith("/mpv/")
  setup(path, mpv ? multi : single, hostname)
  const image = doc.getElementById(mpv ? "imgsrc_1" : "img")
  const nativeStyle = image.getAttribute("style")
  const id = mpv ? "image_1" : "i3"
  start()
  expect(doc.querySelectorAll("#eh-reader-toolbar")).toHaveLength(1)
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(false)
  expect(doc.querySelectorAll("#eh-reader-toolbar button")).toHaveLength(7)
  expect(percent()).toBe("100%")
  expect(doc.documentElement.classList.contains("eh-reader-active")).toBe(false)
  expect(rules().some((rule) => rule.style.getPropertyValue("--ehr-width"))).toBe(false)

  const event = wheel({ deltaY: -Math.log(1.1) / 0.0015 }, image)
  expect(event.defaultPrevented).toBe(true)
  expectDimensions(1100, 2200, id)
  button("out").click()
  expectDimensions(1000, 2000, id)
  button("width").click()
  const width = mpv ? 898 : 998
  expectDimensions(width, width * 2, id)
  button("height").click()
  const height = mpv ? 618 : 744
  expectDimensions(height / 2, height, id)
  expect(key("0").defaultPrevented).toBe(true)
  expect(percent()).toBe("100%")
  expect(dimensions(id)).toBeNull()
  expect(doc.documentElement.classList.contains("eh-reader-active")).toBe(false)
  expect(image.getAttribute("style")).toBe(nativeStyle)
})

test.each(
  ["e-hentai.org", "exhentai.org"].flatMap((hostname) =>
    ["/g/123/token/", "/", "/s", "/mpv", "/gallery/s/token"].map((path) => [hostname, path]),
  ),
)("does not install controls or handlers on %s%s", (hostname, path) => {
  setup(path, single, hostname)
  start()
  expect(doc.getElementById("eh-reader-toolbar")).toBeNull()
  expect(doc.getElementById("eh-reader-style")).toBeNull()
  expect(wheel().defaultPrevented).toBe(false)
  expect(key("+").defaultPrevented).toBe(false)
})

test("keeps controls hidden until a valid reader image is inserted", async () => {
  setup("/s/token/123-1", "<div id='i3'></div>")
  start()
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(true)
  expect(key("+").defaultPrevented).toBe(false)
  doc.getElementById("i3").innerHTML = '<img id="img" width="400" height="800">'
  await settle()
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(false)
  button("in").click()
  expectDimensions(440, 880)
})

test.each([
  [0, -40],
  [0, 40],
  [1, -2.5],
  [1, 2.5],
  [2, -0.05],
  [2, 0.05],
  [0, -10000],
  [0, 10000],
])("Ctrl+wheel mode %i delta %s zooms and cancels native handling", (deltaMode, deltaY) => {
  setup()
  start()
  const later = vi.fn()
  page.addEventListener("wheel", later, true)
  doc.getElementById("img").addEventListener("wheel", later)
  const event = wheel({ deltaMode, deltaY })
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1
  const scale = Math.exp(-Math.max(-100, Math.min(100, deltaY * unit)) * 0.0015)
  expect(event.defaultPrevented).toBe(true)
  expect(later).not.toHaveBeenCalled()
  expect(percent()).toBe(`${Math.round(scale * 100)}%`)
  expectDimensions(1000 * scale, 2000 * scale)
  expect(doc.documentElement.classList.contains("eh-reader-active")).toBe(true)
})

test.each(["e-hentai.org", "exhentai.org"])(
  "MPV keeps its vertical scrollbar hidden during zoom and fit on %s",
  (hostname) => {
    setup("/mpv/123/token/", multi, hostname)
    const pane = doc.getElementById("pane_images")
    const image = doc.getElementById("imgsrc_1")
    const nativeStyle = pane.getAttribute("style")
    const nativeWheel = vi.fn()
    pane.addEventListener("wheel", nativeWheel)
    const thumbs = doc.createElement("div")
    thumbs.id = "pane_thumbs"
    thumbs.style.overflowY = "scroll"
    doc.body.prepend(thumbs)
    const rootOverflow = page.getComputedStyle(doc.documentElement).overflowY
    start()

    for (const change of [
      () => wheel({}, image),
      () => wheel({ deltaY: 40 }, image),
      () => button("in").click(),
      () => button("width").click(),
      () => button("height").click(),
    ]) {
      change()
      const overflow = page.getComputedStyle(pane)
      expect(overflow.overflowY).toBe("hidden")
      expect(overflow.overflowX).toBe("auto")
      expect(page.getComputedStyle(thumbs).overflowY).toBe("scroll")
      expect(page.getComputedStyle(doc.documentElement).overflowY).toBe(rootOverflow)
      expect(pane.getAttribute("style")).toBe(nativeStyle)
    }
    const ordinary = wheel({ ctrlKey: false }, image)
    expect(ordinary.defaultPrevented).toBe(false)
    expect(nativeWheel).toHaveBeenCalledExactlyOnceWith(ordinary)
    pane.scrollTop = 200
    expect(pane.scrollTop).toBe(200)
    button("reset").click()
    expect(pane.style.overflow).toBe("hidden")
    expect(pane.getAttribute("style")).toBe(nativeStyle)
    expect(doc.documentElement.classList.contains("eh-reader-active")).toBe(false)
  },
)

test("MPV page-mode wheel uses the pane height and accepts unloaded placeholders", () => {
  setup("/mpv/123/token/", multi)
  start()
  const event = wheel({ deltaMode: 2, deltaY: -0.05 }, doc.getElementById("image_2"))
  const scale = Math.exp(700 * 0.05 * 0.0015)
  expect(event.defaultPrevented).toBe(true)
  expectDimensions(1000 * scale, 2000 * scale, "image_1")
  expectDimensions(600 * scale, 1200 * scale, "image_2")
})

test.each([
  ["ordinary wheel", { ctrlKey: false }, "img"],
  ["outside reader", {}, "outside"],
  ["input", {}, "input"],
  ["textarea", {}, "textarea"],
  ["select", {}, "select"],
  ["editable descendant", {}, "editable"],
  ["noncancelable", { cancelable: false }, "img"],
  ["Alt modifier", { altKey: true }, "img"],
  ["Meta modifier", { metaKey: true }, "img"],
  ["Shift modifier", { shiftKey: true }, "img"],
  ["zero delta", { deltaY: 0 }, "img"],
])("leaves %s untouched", (_name, options, target) => {
  setup()
  start()
  const later = vi.fn()
  page.addEventListener("wheel", later, true)
  const before = doc.getElementById("eh-reader-style").textContent
  const event = wheel(options, doc.getElementById(target))
  expect(event.defaultPrevented).toBe(false)
  expect(later).toHaveBeenCalledExactlyOnceWith(event)
  expect(doc.getElementById("eh-reader-style").textContent).toBe(before)
  expect(percent()).toBe("100%")
})

test("does not handle a wheel event already canceled by another listener", () => {
  setup()
  start()
  const event = new page.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY: -100,
  })
  event.preventDefault()
  const later = vi.fn()
  page.addEventListener("wheel", later, true)
  doc.getElementById("img").dispatchEvent(event)
  expect(later).toHaveBeenCalledExactlyOnceWith(event)
  expect(percent()).toBe("100%")
  expect(dimensions()).toBeNull()
})

test("contenteditable=false does not block image wheel zoom", () => {
  setup()
  start()
  expect(wheel({}, doc.getElementById("not-editable")).defaultPrevented).toBe(true)
  expect(percent()).toBe("106%")
})

test("toolbar +/- changes scale and reset restores the native inline dimensions", () => {
  setup()
  const native = [...doc.querySelectorAll("[style]")].map((node) => [
    node,
    node.getAttribute("style"),
  ])
  start()
  button("in").click()
  expect(percent()).toBe("110%")
  expectDimensions(1100, 2200)
  button("out").click()
  expect(percent()).toBe("100%")
  expectDimensions(1000, 2000)
  button("width").click()
  button("reset").click()
  expect(percent()).toBe("100%")
  expect(dimensions()).toBeNull()
  expect(doc.documentElement.classList.contains("eh-reader-active")).toBe(false)
  expect(button("width").getAttribute("aria-pressed")).toBe("false")
  for (const [node, style] of native) expect(node.getAttribute("style")).toBe(style)
})

test("keyboard +, =, -, and 0 cancel only their handled events", () => {
  setup()
  start()
  const later = vi.fn()
  page.addEventListener("keydown", later, true)
  for (const [name, expected] of [
    ["+", "110%"],
    ["=", "121%"],
    ["-", "110%"],
    ["0", "100%"],
  ]) {
    expect(key(name).defaultPrevented).toBe(true)
    expect(percent()).toBe(expected)
  }
  expect(later).not.toHaveBeenCalled()
  expect(dimensions()).toBeNull()
})

test.each(["buttons", "wheel"])("clamps %s zoom at 10–800%%", (method) => {
  setup()
  start()
  const zoom = (direction) =>
    method === "buttons"
      ? button(direction).click()
      : wheel({ deltaY: direction === "in" ? -100 : 100 })
  for (let index = 0; index < 60; index++) zoom("in")
  expect(percent()).toBe("800%")
  expectDimensions(8000, 16000)
  expect(button("in").disabled).toBe(true)
  expect(button("out").disabled).toBe(false)
  zoom("in")
  expect(percent()).toBe("800%")
  for (let index = 0; index < 60; index++) zoom("out")
  expect(percent()).toBe("10%")
  expectDimensions(100, 200)
  expect(button("out").disabled).toBe(true)
  expect(button("in").disabled).toBe(false)
  zoom("out")
  expect(percent()).toBe("10%")
  button("reset").click()
  expect(percent()).toBe("100%")
  expect(button("out").disabled).toBe(false)
  expect(button("in").disabled).toBe(false)
})

test.each([false, true])(
  "Shift+W/H fits the %s MPV view and tracks viewport resize",
  async (mpv) => {
    setup(mpv ? "/mpv/123/token/" : "/s/token/123-1", mpv ? multi : single)
    start()
    const id = mpv ? "image_1" : "i3"
    const width = mpv ? 898 : 998
    const height = mpv ? 618 : 744
    expect(key("W", { shiftKey: true }).defaultPrevented).toBe(true)
    expectDimensions(width, width * 2, id)
    expect(button("width").getAttribute("aria-pressed")).toBe("true")
    if (mpv) expectDimensions(width, width * 2, "image_2")
    expect(key("H", { shiftKey: true }).defaultPrevented).toBe(true)
    expectDimensions(height / 2, height, id)
    expect(button("width").getAttribute("aria-pressed")).toBe("false")
    expect(button("height").getAttribute("aria-pressed")).toBe("true")
    const viewport = mpv ? doc.getElementById("pane_images") : doc.documentElement
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 1000 })
    page.dispatchEvent(new page.Event("resize"))
    await settle()
    const resizedHeight = mpv ? 918 : 944
    expectDimensions(resizedHeight / 2, resizedHeight, id)
    // A manual step starts from the current fit scale, not the previous manual scale.
    button("in").click()
    expectDimensions((resizedHeight / 2) * 1.1, resizedHeight * 1.1, id)
    expect(button("height").getAttribute("aria-pressed")).toBe("false")
  },
)

test.each([
  ["width", 100, "10%", 100, 200],
  ["width", 10000, "800%", 8000, 16000],
  ["height", 100, "10%", 100, 200],
  ["height", 20000, "800%", 8000, 16000],
])("clamps %s fit for a viewport of %i pixels", (action, size, output, width, height) => {
  setup()
  Object.defineProperty(doc.documentElement, action === "width" ? "clientWidth" : "clientHeight", {
    configurable: true,
    value: size,
  })
  start()
  button(action).click()
  expect(percent()).toBe(output)
  expectDimensions(width, height)
})

test.each([
  ["w", {}, "outside"],
  ["h", {}, "outside"],
  ["ArrowLeft", {}, "outside"],
  ["ArrowRight", {}, "outside"],
  ["ArrowUp", {}, "outside"],
  ["ArrowDown", {}, "outside"],
  ["+", { ctrlKey: true }, "outside"],
  ["-", { ctrlKey: true }, "outside"],
  ["0", { ctrlKey: true }, "outside"],
  ["w", { ctrlKey: true }, "outside"],
  ["+", { metaKey: true }, "outside"],
  ["+", { altKey: true }, "outside"],
  ["+", { isComposing: true }, "outside"],
  ["+", {}, "input"],
  ["-", {}, "textarea"],
  ["0", {}, "select"],
  ["W", { shiftKey: true }, "editable"],
])("preserves native key %s with %j on %s", (name, options, target) => {
  setup()
  start()
  button("in").click()
  const before = doc.getElementById("eh-reader-style").textContent
  const later = vi.fn()
  page.addEventListener("keydown", later, true)
  const event = key(name, options, doc.getElementById(target))
  expect(event.defaultPrevented).toBe(false)
  expect(later).toHaveBeenCalledExactlyOnceWith(event)
  expect(doc.getElementById("eh-reader-style").textContent).toBe(before)
  expect(percent()).toBe("110%")
})

test("leaves an already canceled keyboard shortcut untouched", () => {
  setup()
  start()
  const event = new page.KeyboardEvent("keydown", { key: "+", cancelable: true, bubbles: true })
  event.preventDefault()
  doc.body.dispatchEvent(event)
  expect(percent()).toBe("100%")
})

test("MPV scales placeholders and loaded images without changing native inline styles or icons", () => {
  setup("/mpv/123/token/", multi)
  const native = [...doc.querySelectorAll("[style]")].map((node) => [
    node,
    node.getAttribute("style"),
  ])
  start()
  button("in").click()
  expectDimensions(1100, 2200, "image_1")
  expectDimensions(660, 1320, "image_2")
  expect(dimensions("image_invalid")).toBeNull()
  const wrapperRule = rules().find(
    (rule) => rule.selectorText === "html.eh-reader-active #pane_images > .mimg",
  )
  expect(wrapperRule.style.getPropertyValue("height")).toBe("calc(var(--ehr-height) + 24px)")
  expect(wrapperRule.style.getPropertyPriority("height")).toBe("important")
  for (const [node, style] of native) expect(node.getAttribute("style")).toBe(style)
  button("reset").click()
  expect(dimensions("image_1")).toBeNull()
  for (const [node, style] of native) expect(node.getAttribute("style")).toBe(style)
})

test.each([false, true])("does not apply image scale rules to navigation icons (MPV=%s)", (mpv) => {
  setup(mpv ? "/mpv/123/token/" : "/s/token/123-1", mpv ? multi : single)
  start()
  button("in").click()
  const icon = doc.getElementById("nav-icon")
  const image = doc.getElementById(mpv ? "imgsrc_1" : "img")
  const imageRule = rules().find(
    (rule) => rule.style.getPropertyValue("height") === "var(--ehr-height)",
  )
  expect(image.matches(imageRule.selectorText)).toBe(true)
  expect(icon.matches(imageRule.selectorText)).toBe(false)
  expect(page.getComputedStyle(icon).width).toBe("18px")
  expect(page.getComputedStyle(icon).height).toBe("12px")
})

test("MPV observes lazy loading, replacement, insertion, removal, and native inline resizing", async () => {
  setup("/mpv/123/token/", multi)
  start()
  button("in").click()
  const placeholder = doc.getElementById("image_2")
  placeholder.innerHTML =
    '<img id="imgsrc_2" src="/loaded.jpg" style="width: 700px; height: 1400px">'
  await settle()
  expectDimensions(770, 1540, "image_2")
  expect(placeholder.style.height).toBe("1224px")

  const replacement = doc.createElement("img")
  replacement.id = "imgsrc_1"
  replacement.width = 800
  replacement.height = 1600
  doc.getElementById("imgsrc_1").replaceWith(replacement)
  const inserted = doc.createElement("div")
  inserted.className = "mimg"
  inserted.id = "image_3"
  inserted.style.cssText = "max-width: 400px; height: 824px"
  doc.getElementById("pane_images").append(inserted)
  await settle()
  expectDimensions(880, 1760, "image_1")
  expectDimensions(440, 880, "image_3")

  replacement.style.width = "1200px"
  replacement.style.height = "2400px"
  doc.getElementById("image_1").style.height = "2424px"
  await settle()
  expectDimensions(1320, 2640, "image_1")
  expect(replacement.style.width).toBe("1200px")
  expect(replacement.style.height).toBe("2400px")
  expect(doc.getElementById("image_1").style.height).toBe("2424px")
  inserted.remove()
  await settle()
  expect(dimensions("image_3")).toBeNull()
})

test("MPV reflects native placeholder width and height changes in its custom stylesheet", async () => {
  setup("/mpv/123/token/", multi)
  start()
  button("in").click()
  const placeholder = doc.getElementById("image_2")
  placeholder.style.maxWidth = "500px"
  placeholder.style.height = "1024px"
  await settle()
  expectDimensions(550, 1100, "image_2")
  expect(placeholder.style.maxWidth).toBe("500px")
  expect(placeholder.style.height).toBe("1024px")
})

test("MPV placeholder widths follow late native pane sizing", async () => {
  setup("/mpv/123/token/", multi)
  const pane = doc.getElementById("pane_images")
  Object.defineProperty(pane, "clientWidth", { configurable: true, value: 492 })
  start()
  button("in").click()
  expectDimensions(541.2, 1320, "image_2")
  Object.defineProperty(pane, "clientWidth", { configurable: true, value: 900 })
  pane.style.width = "900px"
  await settle()
  expectDimensions(660, 1320, "image_2")
})

test("wheel and toolbar actions read native image sizes before a pending observer frame", () => {
  setup("/mpv/123/token/", multi)
  start()
  const placeholder = doc.getElementById("image_2")
  placeholder.innerHTML = '<img id="imgsrc_2" style="width: 700px; height: 1400px">'
  const image = doc.getElementById("imgsrc_2")
  wheel({ deltaY: -Math.log(1.1) / 0.0015 }, image)
  expectDimensions(770, 1540, "image_2")
  image.style.width = "800px"
  image.style.height = "1600px"
  button("in").click()
  expectDimensions(968, 1936, "image_2")
})

test("a lazy single image load uses natural dimensions without writing inline styles", async () => {
  setup("/s/token/123-1", '<div id="i3"><img id="img" src="/lazy.jpg"></div>')
  start()
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(true)
  const image = doc.getElementById("img")
  Object.defineProperties(image, { naturalWidth: { value: 640 }, naturalHeight: { value: 960 } })
  image.dispatchEvent(new page.Event("load"))
  await settle()
  expect(doc.getElementById("eh-reader-toolbar").hidden).toBe(false)
  button("in").click()
  expectDimensions(704, 1056)
  expect(image.getAttribute("style")).toBeNull()
})

test.each([false, true])(
  "Ctrl+wheel preserves the pointer anchor in the correct scroller (MPV=%s)",
  (mpv) => {
    setup(mpv ? "/mpv/123/token/" : "/s/token/123-1", mpv ? multi : single)
    const scroller = mpv ? doc.getElementById("pane_images") : doc.documentElement
    Object.defineProperty(doc, "scrollingElement", { value: doc.documentElement })
    scroller.scrollLeft = 120
    scroller.scrollTop = 450
    const image = doc.getElementById(mpv ? "imgsrc_1" : "img")
    image.getBoundingClientRect = () =>
      doc.documentElement.classList.contains("eh-reader-active")
        ? rect(80, 180, 1100, 2200)
        : rect(100, 200, 1000, 2000)
    start()
    // (350, 700) is at (25%, 25%) before zoom. After zoom that point is at
    // (355, 730), so only the active scroller must move by (+5, +30).
    const event = wheel({ deltaY: -Math.log(1.1) / 0.0015, clientX: 350, clientY: 700 }, image)
    expect(event.defaultPrevented).toBe(true)
    expectDimensions(1100, 2200, mpv ? "image_1" : "i3")
    expect(scroller.scrollLeft).toBeCloseTo(125)
    expect(scroller.scrollTop).toBeCloseTo(480)
    if (mpv) {
      expect(doc.documentElement.scrollLeft).toBe(0)
      expect(doc.documentElement.scrollTop).toBe(0)
    }
  },
)

test("uses only local storage and no network or credential APIs during the reader lifecycle", async () => {
  setup()
  const unused = []
  for (const name of [
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "GM_xmlhttpRequest",
    "GM_getValue",
    "GM_setValue",
  ]) {
    const spy = vi.fn(() => {
      throw new Error(`Unexpected ${name}`)
    })
    Object.defineProperty(page, name, { configurable: true, value: spy })
    unused.push(spy)
  }
  const cookieGet = vi.spyOn(doc, "cookie", "get")
  const cookieSet = vi.spyOn(doc, "cookie", "set")
  unused.push(cookieGet, cookieSet)
  const beacon = vi.fn()
  Object.defineProperty(page.navigator, "sendBeacon", { value: beacon })
  unused.push(beacon)
  const imageSrc = doc.getElementById("img").getAttribute("src")
  start()
  wheel()
  for (const action of ["width", "height", "out", "reset"]) button(action).click()
  doc.getElementById("img").style.width = "1200px"
  page.dispatchEvent(new page.Event("resize"))
  await settle()
  stop()
  for (const spy of unused) expect(spy).not.toHaveBeenCalled()
  expect(doc.getElementById("img").getAttribute("src")).toBe(imageSrc)
  expect(doc.querySelectorAll("script, link, iframe")).toHaveLength(0)
  expect(Object.keys(page.localStorage).sort()).toEqual([
    "eh-reader:preferences",
    "eh-reader:progress:123",
  ])
  expect(JSON.parse(page.localStorage.getItem("eh-reader:preferences"))).toEqual({
    mode: "native",
    scale: 1,
  })
  expect(Object.keys(page.sessionStorage)).toHaveLength(0)
})

test("duplicate startup does not add handlers, and its cleanup does not stop the first instance", () => {
  setup()
  start()
  const windowListen = vi.spyOn(page, "addEventListener")
  const documentListen = vi.spyOn(doc, "addEventListener")
  const duplicateStop = page.eval(source)
  expect(windowListen).not.toHaveBeenCalled()
  expect(documentListen).not.toHaveBeenCalled()
  expect(duplicateStop).toBeTypeOf("function")
  duplicateStop()
  expect(doc.querySelectorAll("#eh-reader-toolbar")).toHaveLength(1)
  expect(doc.querySelectorAll("#eh-reader-style")).toHaveLength(1)
  key("+")
  expect(percent()).toBe("110%")
  stop()
  stop()
  expect(doc.getElementById("eh-reader-toolbar")).toBeNull()
  expect(doc.getElementById("eh-reader-style")).toBeNull()
  expect(doc.documentElement.classList.contains("eh-reader-active")).toBe(false)
  expect(key("+").defaultPrevented).toBe(false)
  expect(wheel().defaultPrevented).toBe(false)
  start()
  expect(percent()).toBe("110%")
  key("+")
  expect(percent()).toBe("121%")
})

test("cleanup cancels a pending observer frame and disconnects all event and observer work", async () => {
  setup()
  start()
  button("in").click()
  await settle()
  const request = vi.spyOn(page, "requestAnimationFrame")
  const cancel = vi.spyOn(page, "cancelAnimationFrame")
  const style = doc.getElementById("eh-reader-style")
  const oldButton = button("in")
  const before = style.textContent
  doc.getElementById("img").style.width = "1500px"
  doc.getElementById("img").style.height = "3000px"
  await Promise.resolve()
  expect(request).toHaveBeenCalledTimes(1)
  const frame = request.mock.results[0].value
  stop()
  expect(cancel).toHaveBeenCalledExactlyOnceWith(frame)
  request.mockClear()
  oldButton.click()
  key("+")
  wheel()
  page.dispatchEvent(new page.Event("resize"))
  doc.getElementById("img").dispatchEvent(new page.Event("load"))
  doc.dispatchEvent(new page.Event("scroll"))
  doc.getElementById("img").style.width = "1700px"
  await Promise.resolve()
  expect(request).not.toHaveBeenCalled()
  await new Promise((resolve) => page.setTimeout(resolve, 40))
  expect(style.textContent).toBe(before)
  expect(doc.getElementById("eh-reader-toolbar")).toBeNull()
  expect(doc.getElementById("eh-reader-style")).toBeNull()
  expect(doc.documentElement.classList.contains("eh-reader-active")).toBe(false)
})
