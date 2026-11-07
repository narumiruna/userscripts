// ==UserScript==
// @name         E-Hentai Reader
// @namespace    userscripts/e-hentai-reader
// @version      0.1.2
// @description  Zoom reader images with Ctrl+wheel, fit images to the viewport, and keep the reading position.
// @match        https://e-hentai.org/s/*
// @match        https://e-hentai.org/mpv/*
// @match        https://exhentai.org/s/*
// @match        https://exhentai.org/mpv/*
// @downloadURL  https://raw.githubusercontent.com/narumiruna/userscripts/main/src/e-hentai-reader/e-hentai-reader.user.js
// @updateURL    https://raw.githubusercontent.com/narumiruna/userscripts/main/src/e-hentai-reader/e-hentai-reader.user.js
// @run-at       document-idle
// @grant        none
// @noframes
// @license      AGPL-3.0-only
// ==/UserScript==

// @ts-check

;(() => {
  // biome-ignore lint/suspicious/noRedundantUseStrict: Userscript managers run this as a classic script.
  "use strict"

  const toolbarId = "eh-reader-toolbar"
  const styleId = "eh-reader-style"
  const activeClass = "eh-reader-active"
  if (!/^\/(s|mpv)\//.test(location.pathname) || document.getElementById(toolbarId)) {
    return () => {}
  }

  const mpv = location.pathname.startsWith("/mpv/")
  const minScale = 0.1
  const maxScale = 8
  /** @typedef {{element: HTMLElement, image: HTMLImageElement | null, width: number, height: number}} Page */
  /** @typedef {{node: Element, x: number, y: number, rx: number, ry: number}} Anchor */
  /** @type {Map<HTMLElement, Page>} */
  let pages = new Map()
  /** @type {"native" | "manual" | "width" | "height"} */
  let mode = "native"
  let manualScale = 1
  let frame = 0
  let stopped = false

  const css = `
    html.${activeClass}, html.${activeClass} #pane_images {
      overflow-anchor: none !important;
      scroll-behavior: auto !important;
    }
    html.${activeClass} #pane_images {
      overflow-x: auto !important;
      overflow-y: hidden !important;
    }
    html.${activeClass} #pane_images > .mimg {
      box-sizing: content-box !important;
      width: var(--ehr-width) !important;
      height: calc(var(--ehr-height) + 24px) !important;
      min-width: 0 !important;
      max-width: none !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }
    html.${activeClass} #i1 { max-width: none !important; }
    html.${activeClass} #i3 {
      width: var(--ehr-width) !important;
      height: auto !important;
      max-width: none !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }
    html.${activeClass} #img,
    html.${activeClass} #pane_images > .mimg img[id^="imgsrc_"] {
      display: block !important;
      width: var(--ehr-width) !important;
      height: var(--ehr-height) !important;
      min-width: 0 !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
    }
    #${toolbarId} {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      max-width: calc(100vw - 32px);
      box-sizing: border-box;
      padding: 6px;
      border: 1px solid #666;
      border-radius: 8px;
      background: #202124;
      color: #f1f3f4;
      box-shadow: 0 2px 12px #0006;
      font: 13px/1.4 system-ui, sans-serif;
      text-align: center;
    }
    #${toolbarId}[hidden] { display: none; }
    #${toolbarId} button {
      appearance: none;
      min-width: 32px;
      min-height: 32px;
      margin: 0;
      padding: 4px 8px;
      border: 1px solid #666;
      border-radius: 4px;
      background: #303134;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    #${toolbarId} button:hover, #${toolbarId} button[aria-pressed="true"] {
      background: #454c58;
    }
    #${toolbarId} button:focus-visible { outline: 2px solid #8ab4f8; }
    #${toolbarId} button:disabled { opacity: .4; cursor: default; }
    #${toolbarId} output { min-width: 48px; font-variant-numeric: tabular-nums; }
  `
  const style = document.createElement("style")
  style.id = styleId
  style.textContent = css
  document.head.append(style)

  const toolbar = document.createElement("div")
  toolbar.id = toolbarId
  toolbar.setAttribute("role", "group")
  toolbar.setAttribute("aria-label", "E-Hentai Reader 圖片縮放")
  toolbar.title = "圖片上 Ctrl＋滾輪縮放；＋／－縮放；0 重設；Shift＋W 適寬；Shift＋H 適高"
  toolbar.hidden = true
  const output = document.createElement("output")
  output.setAttribute("aria-label", "圖片縮放比例")
  output.setAttribute("aria-live", "polite")
  /** @type {Map<string, HTMLButtonElement>} */
  const buttons = new Map()
  for (const [action, label, title] of [
    ["out", "−", "縮小圖片 (−)"],
    ["in", "+", "放大圖片 (+)"],
    ["width", "適寬", "適合閱讀區寬度 (Shift+W)"],
    ["height", "適高", "適合閱讀區高度 (Shift+H)"],
    ["reset", "重設", "還原原站圖片尺寸 (0)"],
  ]) {
    const button = document.createElement("button")
    button.type = "button"
    button.dataset.action = action
    button.textContent = label
    button.title = title
    button.setAttribute("aria-label", title)
    buttons.set(action, button)
    toolbar.append(button)
    if (action === "out") toolbar.append(output)
  }
  document.body.append(toolbar)

  function view() {
    const pane = mpv ? document.getElementById("pane_images") : null
    const rect = pane?.getBoundingClientRect()
    return {
      pane,
      left: rect ? rect.left + (pane?.clientLeft ?? 0) : 0,
      top: rect ? rect.top + (pane?.clientTop ?? 0) : 0,
      width: pane?.clientWidth || document.documentElement.clientWidth || innerWidth,
      height: pane?.clientHeight || document.documentElement.clientHeight || innerHeight,
    }
  }

  /** @param {number} value */
  function clampScale(value) {
    return Math.max(minScale, Math.min(maxScale, value))
  }

  /** @param {Page} page */
  function scaleFor(page) {
    const bounds = view()
    if (mode === "width") return clampScale((bounds.width - 2) / page.width)
    if (mode === "height") {
      return clampScale((bounds.height - 56 - (mpv ? 26 : 0)) / page.height)
    }
    return mode === "manual" ? manualScale : 1
  }

  function currentPage() {
    const bounds = view()
    const y = bounds.top + bounds.height / 2
    let nearest = null
    let distance = Infinity
    for (const page of pages.values()) {
      const rect = page.element.getBoundingClientRect()
      const gap = Math.max(rect.top - y, y - rect.bottom, 0)
      if (gap < distance) {
        nearest = page
        distance = gap
      }
      if (gap === 0) break
    }
    return nearest
  }

  /** @param {EventTarget | null} target */
  function pageFromTarget(target) {
    if (!(target instanceof Element)) return null
    const element = target.closest(mpv ? "#pane_images > .mimg" : "#i3")
    return element instanceof HTMLElement ? (pages.get(element) ?? null) : null
  }

  /** @param {EventTarget | null} target */
  function isEditable(target) {
    return (
      target instanceof Element &&
      Boolean(
        target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"),
      )
    )
  }

  /** @param {Page | null} page @param {number} [x] @param {number} [y] @returns {Anchor | null} */
  function anchorFor(page, x, y) {
    if (!page) return null
    const bounds = view()
    const node = page.image?.isConnected ? page.image : page.element
    const rect = node.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    x ??= bounds.left + bounds.width / 2
    y ??= bounds.top + bounds.height / 2
    return {
      node,
      x,
      y,
      rx: Math.max(0, Math.min(1, (x - rect.left) / rect.width)),
      ry: Math.max(0, Math.min(1, (y - rect.top) / rect.height)),
    }
  }

  /** @param {Anchor | null} anchor */
  function restoreAnchor(anchor) {
    if (!anchor?.node.isConnected) return
    const rect = anchor.node.getBoundingClientRect()
    const scroller = view().pane ?? document.scrollingElement ?? document.documentElement
    scroller.scrollLeft += rect.left + rect.width * anchor.rx - anchor.x
    scroller.scrollTop += rect.top + rect.height * anchor.ry - anchor.y
  }

  function render() {
    // Measure the reading area after applying its overflow rules.
    document.documentElement.classList.toggle(activeClass, mode !== "native" && pages.size > 0)
    const rules = []
    if (mode !== "native") {
      for (const page of pages.values()) {
        const scale = scaleFor(page)
        // Keep native inline dimensions unchanged. MPV still owns loading and resizing.
        rules.push(
          `#${page.element.id} { --ehr-width: ${(page.width * scale).toFixed(3)}px; --ehr-height: ${(page.height * scale).toFixed(3)}px; }`,
        )
      }
    }
    const text = `${css}\n${rules.join("\n")}`
    if (style.textContent !== text) style.textContent = text
    toolbar.hidden = pages.size === 0
    updateControls()
  }

  function updateControls() {
    const page = currentPage()
    const scale = page ? scaleFor(page) : 1
    const text = `${Math.round(scale * 100)}%`
    if (output.textContent !== text) output.textContent = text
    for (const [action, button] of buttons) {
      if (action === "width" || action === "height") {
        button.setAttribute("aria-pressed", String(mode === action))
      }
      button.disabled =
        !page || (action === "out" && scale <= minScale) || (action === "in" && scale >= maxScale)
    }
  }

  function refresh() {
    const anchor = mode === "native" ? null : anchorFor(currentPage())
    const bounds = view()
    /** @type {Map<HTMLElement, Page>} */
    const next = new Map()
    const selector = mpv ? "#pane_images > .mimg[id]" : "#i3"
    for (const element of document.querySelectorAll(selector)) {
      if (!(element instanceof HTMLElement) || (mpv && !/^image_\d+$/.test(element.id))) continue
      const image = element.querySelector(mpv ? "img[id^='imgsrc_']" : "#img")
      const img = image instanceof HTMLImageElement ? image : null
      const previous = pages.get(element)
      let width = img
        ? Number.parseFloat(img.style.width) ||
          img.naturalWidth ||
          Number(img.getAttribute("width"))
        : 0
      let height = img
        ? Number.parseFloat(img.style.height) ||
          img.naturalHeight ||
          Number(img.getAttribute("height"))
        : 0
      if (mpv) {
        width ||= Math.min(
          Number.parseFloat(element.style.maxWidth) || previous?.width || bounds.width,
          bounds.width,
        )
        height ||= Number.parseFloat(element.style.height) - 24
      }
      if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) continue
      next.set(element, { element, image: img, width, height })
    }
    pages = next
    render()
    restoreAnchor(anchor)
  }

  function scheduleRefresh() {
    if (stopped || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      refresh()
    })
  }

  /** @param {number} scale @param {Anchor | null} anchor */
  function zoomTo(scale, anchor) {
    mode = "manual"
    manualScale = clampScale(scale)
    render()
    restoreAnchor(anchor)
  }

  /** @param {string} action */
  function runAction(action) {
    refresh()
    const page = currentPage()
    if (!page) return
    const anchor = anchorFor(page)
    if (action === "in" || action === "out") {
      zoomTo(scaleFor(page) * (action === "in" ? 1.1 : 1 / 1.1), anchor)
      return
    }
    if (action === "width" || action === "height") {
      mode = action
      // Show the start of the current page when selecting a fit mode.
      if (anchor) {
        anchor.rx = 0.5
        anchor.ry = 0
        anchor.x = view().left + view().width / 2
        anchor.y = view().top + 4
      }
    } else if (action === "reset") {
      mode = "native"
    } else {
      return
    }
    render()
    restoreAnchor(anchor)
  }

  /** @param {WheelEvent} event */
  function onWheel(event) {
    if (
      !event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey ||
      !event.cancelable ||
      event.defaultPrevented ||
      isEditable(event.target)
    ) {
      return
    }
    if (
      !event.deltaY ||
      !Number.isFinite(event.deltaY) ||
      !(event.target instanceof Element) ||
      !event.target.closest(mpv ? "#pane_images > .mimg" : "#i3")
    ) {
      return
    }
    // Background tabs can pause the observer's animation frame. Read native sizes now.
    refresh()
    const page = pageFromTarget(event.target)
    if (!page) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view().height : 1
    const delta = Math.max(-100, Math.min(100, event.deltaY * unit))
    zoomTo(
      scaleFor(page) * Math.exp(-delta * 0.0015),
      anchorFor(page, event.clientX, event.clientY),
    )
  }

  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.isComposing ||
      event.defaultPrevented ||
      isEditable(event.target) ||
      !pages.size
    ) {
      return
    }
    const key = event.key.toLowerCase()
    const action =
      key === "+" || key === "="
        ? "in"
        : key === "-"
          ? "out"
          : key === "0"
            ? "reset"
            : event.shiftKey && key === "w"
              ? "width"
              : event.shiftKey && key === "h"
                ? "height"
                : null
    if (!action) return
    event.preventDefault()
    event.stopImmediatePropagation()
    runAction(action)
  }

  const controller = new AbortController()
  const signal = controller.signal
  window.addEventListener("wheel", onWheel, { capture: true, passive: false, signal })
  window.addEventListener("keydown", onKeyDown, { capture: true, signal })
  window.addEventListener("resize", scheduleRefresh, { signal })
  document.addEventListener("load", scheduleRefresh, { capture: true, signal })
  document.addEventListener("scroll", updateControls, { capture: true, passive: true, signal })
  toolbar.addEventListener(
    "click",
    (event) => {
      const button = event.target instanceof Element ? event.target.closest("button") : null
      if (button instanceof HTMLButtonElement) runAction(button.dataset.action ?? "")
    },
    { signal },
  )
  const observer = new MutationObserver((records) => {
    if (records.some((record) => !toolbar.contains(record.target))) scheduleRefresh()
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "src", "width", "height"],
  })
  refresh()

  return () => {
    if (stopped) return
    stopped = true
    controller.abort()
    observer.disconnect()
    cancelAnimationFrame(frame)
    document.documentElement.classList.remove(activeClass)
    toolbar.remove()
    style.remove()
    pages.clear()
  }
})()
