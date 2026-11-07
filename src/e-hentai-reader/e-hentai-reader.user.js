// ==UserScript==
// @name         E-Hentai Reader
// @namespace    userscripts/e-hentai-reader
// @version      0.2.0
// @description  Zoom reader images, remember view settings, and resume reading from locally saved progress.
// @match        https://e-hentai.org/*
// @match        https://exhentai.org/*
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
  const preferenceKey = "eh-reader:preferences"
  const progressPrefix = "eh-reader:progress:"
  const continuationKey = "eh-reader:continue"
  const resumeHash = "#eh-reader-resume"
  let storageError = false
  if (document.getElementById(toolbarId)) return () => {}

  /** @typedef {"native" | "manual" | "width" | "height"} ViewMode */
  /** @typedef {{page: number, offset: number, path: string}} Progress */

  /** @param {string} path */
  function readerLocation(path) {
    const single = path.match(/^\/s\/[a-z0-9]+\/([1-9]\d*)-([1-9]\d*)\/?$/i)
    const multi = path.match(/^\/mpv\/([1-9]\d*)\/[a-z0-9]+\/?$/i)
    const match = single ?? multi
    if (!match || !Number.isSafeInteger(Number(match[1]))) return null
    const page = single ? Number(single[2]) : 1
    if (!Number.isSafeInteger(page)) return null
    return { id: match[1], page, path, mpv: Boolean(multi) }
  }

  /** @param {string} key */
  function readStored(key) {
    let value
    try {
      value = localStorage.getItem(key)
    } catch {
      storageError = true
      return null
    }
    try {
      return value === null ? null : JSON.parse(value)
    } catch {
      return null
    }
  }

  /** @param {string} key @param {object} value */
  function writeStored(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      storageError = true
      return false
    }
  }

  /** @param {string} id @returns {Progress | null} */
  function readProgress(id) {
    const value = readStored(progressPrefix + id)
    if (
      !value ||
      !Number.isSafeInteger(value.page) ||
      value.page < 1 ||
      !Number.isFinite(value.offset) ||
      value.offset < 0 ||
      value.offset > 1 ||
      typeof value.path !== "string"
    )
      return null
    const target = readerLocation(value.path)
    if (!target || target.id !== id || (!target.mpv && target.page !== value.page)) return null
    return { page: value.page, offset: value.offset, path: value.path }
  }

  function clearProgress() {
    if (!window.confirm("清除本站所有閱讀紀錄？縮放偏好會保留。")) return false
    try {
      for (let index = localStorage.length - 1; index >= 0; index--) {
        const key = localStorage.key(index)
        if (key?.startsWith(progressPrefix)) localStorage.removeItem(key)
      }
      return true
    } catch {
      storageError = true
      return false
    }
  }

  /** @param {string} href */
  function localUrl(href) {
    try {
      const url = new URL(href, location.href)
      return url.origin === location.origin ? url : null
    } catch {
      return null
    }
  }

  /** @param {string} path */
  function takeContinuation(path) {
    try {
      const continuing = sessionStorage.getItem(continuationKey) === path
      sessionStorage.removeItem(continuationKey)
      return continuing
    } catch {
      return false
    }
  }

  function startGalleryProgress() {
    if (!document.querySelector('a[href*="/g/"], #gn')) return () => {}
    const style = document.createElement("style")
    style.id = styleId
    style.textContent = `
      .eh-reader-progress { display: inline-block; margin: 4px 8px; font: 13px/1.4 system-ui, sans-serif; }
      #${toolbarId} { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
        padding: 8px; border: 1px solid #666; border-radius: 8px; background: #202124; color: #f1f3f4;
        font: 13px/1.4 system-ui, sans-serif; }
      #${toolbarId}[hidden] { display: none; }
      #${toolbarId} button { min-height: 32px; cursor: pointer; }
    `
    const panel = document.createElement("div")
    panel.id = toolbarId
    panel.hidden = true
    const clear = document.createElement("button")
    clear.type = "button"
    clear.textContent = "清除閱讀紀錄"
    const status = document.createElement("span")
    status.setAttribute("role", "status")
    panel.append(clear, status)
    document.head.append(style)
    document.body.append(panel)
    /** @type {Map<Element, HTMLAnchorElement>} */
    const badges = new Map()
    let frame = 0

    function refresh() {
      /** @type {Map<Element, string>} */
      const targets = new Map()
      for (const link of document.querySelectorAll("a[href]")) {
        if (!link.textContent?.trim() || link.classList.contains("eh-reader-progress")) continue
        const url = localUrl(link.getAttribute("href") ?? "")
        const match = url?.pathname.match(/^\/g\/([1-9]\d*)\/[a-z0-9]+\/?$/i)
        if (match) targets.set(link, match[1])
      }
      const match = location.pathname.match(/^\/g\/([1-9]\d*)\/[a-z0-9]+\/?$/i)
      const heading = document.getElementById("gn")
      if (match && heading) targets.set(heading, match[1])
      for (const [target, badge] of badges) {
        if (!targets.has(target) || !readProgress(targets.get(target) ?? "")) {
          badge.remove()
          badges.delete(target)
        }
      }
      for (const [target, id] of targets) {
        const progress = readProgress(id)
        if (!progress) continue
        let badge = badges.get(target)
        if (!badge) {
          badge = document.createElement("a")
          badge.className = "eh-reader-progress"
          badges.set(target, badge)
        }
        if (target.nextSibling !== badge) target.after(badge)
        const text = `繼續閱讀：第 ${progress.page} 頁`
        if (badge.textContent !== text) badge.textContent = text
        const href = progress.path + resumeHash
        if (badge.getAttribute("href") !== href) badge.setAttribute("href", href)
      }
      panel.hidden = badges.size === 0 && !storageError
      const text = storageError ? " 無法使用本機儲存。" : ""
      if (status.textContent !== text) status.textContent = text
    }

    function schedule() {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        refresh()
      })
    }
    const controller = new AbortController()
    const signal = controller.signal
    clear.addEventListener(
      "click",
      () => {
        clearProgress()
        refresh()
      },
      { signal },
    )
    window.addEventListener("storage", schedule, { signal })
    const observer = new MutationObserver((records) => {
      if (records.some((record) => !panel.contains(record.target))) schedule()
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"],
    })
    refresh()
    return () => {
      controller.abort()
      observer.disconnect()
      cancelAnimationFrame(frame)
      for (const badge of badges.values()) badge.remove()
      panel.remove()
      style.remove()
    }
  }

  const reader = readerLocation(location.pathname)
  if (!reader) return startGalleryProgress()
  let gallery = reader
  const continuing = takeContinuation(gallery.path)
  const mpv = gallery.mpv
  const minScale = 0.1
  const maxScale = 8
  /** @typedef {{element: HTMLElement, image: HTMLImageElement | null, width: number, height: number}} Page */
  /** @typedef {{node: Element, x: number, y: number, rx: number, ry: number}} Anchor */
  /** @type {Map<HTMLElement, Page>} */
  let pages = new Map()
  const preference = readStored(preferenceKey)
  /** @type {ViewMode} */
  let mode =
    preference &&
    ["native", "manual", "width", "height"].includes(preference.mode) &&
    Number.isFinite(preference.scale) &&
    preference.scale >= minScale &&
    preference.scale <= maxScale
      ? preference.mode
      : "native"
  let manualScale = mode === "manual" ? preference.scale : 1
  let pendingProgress = continuing ? null : readProgress(gallery.id)
  let recording = !pendingProgress
  let resumeRequested = location.hash === resumeHash
  let progressTimer = 0
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
    #${toolbarId}[hidden], #${toolbarId} [hidden] { display: none; }
    #${toolbarId} a { text-decoration: none; }
    #${toolbarId} button, #${toolbarId} a {
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
    #${toolbarId} button:hover, #${toolbarId} a:hover, #${toolbarId} button[aria-pressed="true"] {
      background: #454c58;
    }
    #${toolbarId} button:focus-visible, #${toolbarId} a:focus-visible { outline: 2px solid #8ab4f8; }
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
  toolbar.setAttribute("aria-label", "E-Hentai Reader 閱讀控制")
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
  const position = document.createElement("span")
  position.id = "eh-reader-position"
  const resume = document.createElement("a")
  resume.dataset.action = "resume"
  const startHere = document.createElement("button")
  startHere.type = "button"
  startHere.dataset.action = "start"
  startHere.textContent = "從此處閱讀"
  const clear = document.createElement("button")
  clear.type = "button"
  clear.dataset.action = "clear"
  clear.textContent = "清除紀錄"
  const status = document.createElement("span")
  status.setAttribute("role", "status")
  toolbar.append(position, resume, startHere, clear, status)
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
    const number = page ? pageNumber(page) : gallery.page
    const label = `第 ${number} 頁`
    if (position.textContent !== label) position.textContent = label
    resume.hidden = startHere.hidden = !pendingProgress
    if (pendingProgress) {
      const text = `繼續閱讀：第 ${pendingProgress.page} 頁`
      if (resume.textContent !== text) resume.textContent = text
      const href = (mpv ? gallery.path : pendingProgress.path) + resumeHash
      if (resume.getAttribute("href") !== href) resume.setAttribute("href", href)
    }
    if (storageError) status.textContent = "無法使用本機儲存；變更不會保存。"
  }

  function refresh() {
    syncLocation()
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
    if (resumeRequested) resumeProgress()
    scheduleProgress()
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
    savePreference()
  }

  /** @param {string} action */
  function runAction(action) {
    if (action === "start") {
      beginReading()
      saveProgress()
      return
    }
    if (action === "clear") {
      if (clearProgress()) {
        pendingProgress = null
        recording = false
        resumeRequested = false
        clearTimeout(progressTimer)
        status.textContent = "已清除本站閱讀紀錄。"
      }
      updateControls()
      return
    }
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
    savePreference()
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

  function syncLocation() {
    const next = readerLocation(location.pathname)
    if (!next || next.mpv !== mpv) return false
    if (next.path !== gallery.path) {
      const changedGallery = next.id !== gallery.id
      gallery = next
      const continuing = takeContinuation(next.path)
      if (changedGallery) {
        pendingProgress = readProgress(next.id)
        recording = !pendingProgress
      }
      if (continuing) {
        pendingProgress = null
        recording = true
      }
      resumeRequested = location.hash === resumeHash
      updateControls()
    }
    return true
  }

  function savePreference() {
    writeStored(preferenceKey, { mode, scale: mode === "manual" ? manualScale : 1 })
    updateControls()
  }

  /** @param {Page} page */
  function pageNumber(page) {
    return mpv ? Number(page.element.id.slice(6)) : gallery.page
  }

  /** @param {Page} page */
  function readingRect(page) {
    const image = page.image?.isConnected ? page.image : null
    const rect = (image ?? page.element).getBoundingClientRect()
    const placeholder = mpv && !image
    const top = rect.top + (placeholder ? page.element.clientTop : 0)
    const height =
      (placeholder ? page.element.clientHeight || rect.height : rect.height) -
      (placeholder ? 24 : 0)
    return { top, bottom: top + height, height }
  }

  function saveProgress() {
    clearTimeout(progressTimer)
    progressTimer = 0
    if (stopped || !syncLocation()) return
    const page = currentPage()
    if (!recording || !page) return
    const rect = readingRect(page)
    const number = pageNumber(page)
    const bounds = view()
    if (
      !(rect.height > 0) ||
      rect.bottom <= bounds.top ||
      rect.top >= bounds.top + bounds.height ||
      !Number.isSafeInteger(number) ||
      number < 1
    )
      return
    const offset = Math.max(0, Math.min(1, (view().top + 4 - rect.top) / rect.height))
    writeStored(progressPrefix + gallery.id, { page: number, offset, path: gallery.path })
    updateControls()
  }

  function scheduleProgress() {
    if (!recording || stopped) return
    clearTimeout(progressTimer)
    progressTimer = window.setTimeout(saveProgress, 300)
  }

  function beginReading() {
    if (!pages.size) return
    pendingProgress = null
    resumeRequested = false
    recording = true
    if (location.hash === resumeHash) {
      history.replaceState(history.state, "", location.pathname + location.search)
    }
    updateControls()
    scheduleProgress()
  }

  function resumeProgress() {
    if (!pendingProgress) return
    const target = mpv
      ? [...pages.values()].find((page) => pageNumber(page) === pendingProgress?.page)
      : gallery.page === pendingProgress.page
        ? currentPage()
        : null
    if (!target) return
    const rect = readingRect(target)
    if (!(rect.height > 0)) return
    const scroller = view().pane ?? document.scrollingElement ?? document.documentElement
    scroller.scrollTop += rect.top + rect.height * pendingProgress.offset - view().top - 4
    // Scrolling an MPV placeholder triggers native loading. Its final size can differ.
    if (mpv && !target.image?.isConnected) return
    beginReading()
    saveProgress()
  }

  /** @param {Event} event */
  function onReadingInput(event) {
    if (
      event.defaultPrevented ||
      isEditable(event.target) ||
      (event.target instanceof Node && toolbar.contains(event.target))
    )
      return
    if (!syncLocation()) return
    if (event instanceof KeyboardEvent) {
      const key = event.key.toLowerCase()
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.shiftKey && key !== " ") ||
        event.isComposing ||
        (![
          "arrowleft",
          "arrowright",
          "arrowup",
          "arrowdown",
          "pageup",
          "pagedown",
          "home",
          "end",
          " ",
          "w",
          "a",
          "s",
          "d",
        ].includes(key) &&
          !["Numpad2", "Numpad4", "Numpad6", "Numpad8"].includes(event.code))
      )
        return
    } else if (event.type === "click") {
      const element = event.target instanceof Element ? event.target : null
      const link = element?.closest("a[href]")
      const url = link ? localUrl(link.getAttribute("href") ?? "") : null
      if (
        !(mpv && element?.closest("#pane_images, #pane_thumbs")) &&
        !(url?.origin === location.origin && readerLocation(url.pathname)?.id === gallery.id)
      )
        return
      if (
        url?.origin === location.origin &&
        readerLocation(url.pathname)?.id === gallery.id &&
        (!link?.getAttribute("target") || link.getAttribute("target") === "_self") &&
        event instanceof MouseEvent &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        try {
          sessionStorage.setItem(continuationKey, url.pathname)
        } catch {
          // Do not block native page navigation when session storage is unavailable.
        }
      }
    } else {
      if (
        event instanceof WheelEvent &&
        (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !event.deltaY)
      )
        return
      if (!(event.target instanceof Element) || !event.target.closest(mpv ? "#pane_images" : "#i3"))
        return
    }
    beginReading()
    if (event.type === "click") saveProgress()
  }

  const controller = new AbortController()
  const signal = controller.signal
  for (const type of ["wheel", "touchmove", "keydown", "click"]) {
    window.addEventListener(type, onReadingInput, { capture: true, passive: true, signal })
  }
  window.addEventListener("pagehide", saveProgress, { signal })
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) saveProgress()
    },
    { signal },
  )
  window.addEventListener(
    "storage",
    (event) => {
      if (event.key === null || event.key === progressPrefix + gallery.id) {
        pendingProgress = event.newValue === null ? null : readProgress(gallery.id)
        recording = false
        resumeRequested = false
        clearTimeout(progressTimer)
        updateControls()
      }
    },
    { signal },
  )
  window.addEventListener("wheel", onWheel, { capture: true, passive: false, signal })
  window.addEventListener("keydown", onKeyDown, { capture: true, signal })
  window.addEventListener("resize", scheduleRefresh, { signal })
  window.addEventListener("popstate", scheduleRefresh, { signal })
  document.addEventListener("load", scheduleRefresh, { capture: true, signal })
  document.addEventListener(
    "scroll",
    () => {
      updateControls()
      scheduleProgress()
    },
    { capture: true, passive: true, signal },
  )
  toolbar.addEventListener(
    "click",
    (event) => {
      const control = event.target instanceof Element ? event.target.closest("button, a") : null
      if (control === resume && pendingProgress) {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
          return
        if (mpv || gallery.page === pendingProgress.page) {
          event.preventDefault()
          resumeRequested = true
          refresh()
        }
      } else if (control instanceof HTMLButtonElement) {
        runAction(control.dataset.action ?? "")
      }
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
    saveProgress()
    stopped = true
    clearTimeout(progressTimer)
    controller.abort()
    observer.disconnect()
    cancelAnimationFrame(frame)
    document.documentElement.classList.remove(activeClass)
    toolbar.remove()
    style.remove()
    pages.clear()
  }
})()
