// ==UserScript==
// @name         E-Hentai Reader
// @namespace    userscripts/e-hentai-reader
// @version      0.5.0
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
  const resumeParameter = "eh-reader-resume"
  const resumeHash = `#${resumeParameter}`
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

  /** @param {Progress} progress @param {string} [path] */
  function resumeHref(progress, path = progress.path) {
    return (
      path +
      (readerLocation(path)?.mpv
        ? `?${resumeParameter}=${progress.page}:${progress.offset}#page${progress.page}`
        : resumeHash)
    )
  }

  /** @returns {{progress: Progress | null} | null} */
  function readResumeRequest() {
    const reader = readerLocation(location.pathname)
    const legacy = location.hash === resumeHash
    if (!reader?.mpv) return legacy ? { progress: null } : null
    const value = new URLSearchParams(location.search).get(resumeParameter)
    if (value === "1") {
      const saved = readProgress(reader.id)
      const page = Number(location.hash.match(/^#page([1-9]\d*)$/)?.[1])
      // Old links contain no offset snapshot. Do not apply another page's offset.
      return {
        progress:
          Number.isSafeInteger(page) && page > 0 && saved?.page !== page
            ? { page, offset: 0, path: reader.path }
            : saved,
      }
    }
    const [pageValue, offsetValue, ...extra] = value?.split(":") ?? []
    const page = Number(pageValue)
    const offset = Number(offsetValue)
    if (
      pageValue &&
      /^[1-9]\d*$/.test(pageValue) &&
      Number.isSafeInteger(page) &&
      offsetValue?.trim() &&
      Number.isFinite(offset) &&
      offset >= 0 &&
      offset <= 1 &&
      extra.length === 0
    )
      return { progress: { page, offset, path: reader.path } }
    return legacy ? { progress: null } : null
  }

  function clearResumeRequest() {
    const url = new URL(location.href)
    if (url.hash === resumeHash) url.hash = ""
    if (
      readerLocation(url.pathname)?.mpv &&
      url.searchParams.has(resumeParameter) &&
      readResumeRequest()
    )
      url.searchParams.delete(resumeParameter)
    if (url.href !== location.href)
      history.replaceState(history.state, "", url.pathname + url.search + url.hash)
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
      return continuing && !readerLocation(path)?.mpv && !readResumeRequest()
    } catch {
      return false
    }
  }

  function toolbarCss() {
    return `
    #${toolbarId}, #eh-reader-status { --ehr-edge: 24px; }
    #${toolbarId} {
      position: fixed;
      right: var(--ehr-edge);
      bottom: var(--ehr-edge);
      z-index: 2147483647;
      width: 64px;
      box-sizing: border-box;
      padding: 9px;
      border: 1px solid #484b52;
      border-radius: 14px;
      background: #25262a;
      color: #e6e7ea;
      box-shadow: 0 8px 32px #0005, 0 1px 3px #0006;
      font: 13px/1.6 system-ui, sans-serif;
      text-align: center;
    }
    #${toolbarId} * { box-sizing: border-box; }
    #${toolbarId} .eh-reader-controls {
      max-height: calc(100dvh - 2 * var(--ehr-edge) - 20px);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: none;
    }
    #${toolbarId} .eh-reader-controls::-webkit-scrollbar { display: none; }
    #${toolbarId} .eh-reader-group {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
    }
    #${toolbarId} .eh-reader-divider {
      display: block; height: 1px; margin: 7px 6px; background: #ffffff13;
    }
    #${toolbarId} button, #${toolbarId} a {
      position: relative;
      appearance: none;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      flex: none;
      margin: 0;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: #c5c8d0;
      box-shadow: none;
      font: inherit;
      text-decoration: none;
      cursor: pointer;
    }
    #${toolbarId} button:hover:not(:disabled), #${toolbarId} a:hover {
      background: #373940; color: #fff;
    }
    #${toolbarId} button[aria-pressed="true"] {
      border-color: #a8c7fa26; background: #a8c7fa1c; color: #c1d8ff;
    }
    #${toolbarId} button:focus-visible, #${toolbarId} a:focus-visible {
      outline: 2px solid #a8c7fa; outline-offset: -3px;
    }
    #${toolbarId} button:disabled { opacity: .3; cursor: default; }
    #${toolbarId} [data-action="resume"] { color: #a8c7fa; }
    #${toolbarId} [data-action="clear"] { color: #9da1ac; }
    #${toolbarId} [data-action="clear"]:hover { background: #ed8e8e19; color: #f1a3a3; }
    #${toolbarId} svg {
      display: block; width: 20px; height: 20px; fill: none; stroke: currentColor;
      stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
    }
    #${toolbarId} .eh-reader-page-badge {
      position: absolute; right: 2px; bottom: 2px; min-width: 15px; max-width: 36px;
      height: 15px; padding: 0 3px; overflow: hidden; border: 1px solid #6d86ab;
      border-radius: 4px; background: #33435c; color: #e0ebff;
      font-size: 9px; line-height: 13px; font-variant-numeric: tabular-nums;
      white-space: nowrap; text-overflow: ellipsis; text-align: center;
    }
    #${toolbarId} #eh-reader-position {
      display: flex; justify-content: center; align-items: center; gap: 4px;
      height: 30px; color: #b6bac5; font-size: 12px; font-variant-numeric: tabular-nums;
    }
    #${toolbarId} #eh-reader-position svg { width: 14px; height: 14px; }
    #${toolbarId} output {
      display: block; width: 44px; padding: 2px 0; color: #e8eaf0;
      font-size: 11px; font-weight: 500; line-height: 20px; font-variant-numeric: tabular-nums;
    }
    #${toolbarId} .eh-reader-tooltip, #eh-reader-status {
      position: fixed; width: max-content; padding: 8px 11px; border: 1px solid #4c4f58;
      border-radius: 7px; background: #303239; color: #f1f3f7;
      box-shadow: 0 4px 16px #0004; font: 12px/1.6 system-ui, sans-serif; text-align: left;
      overflow-wrap: anywhere;
    }
    #${toolbarId} .eh-reader-tooltip {
      display: flex; align-items: center; gap: 16px;
      max-width: calc(100vw - var(--ehr-edge) - 88px); pointer-events: none;
    }
    #${toolbarId} .eh-reader-tooltip kbd {
      color: #b4b9c5; font: 11px/1.4 system-ui, sans-serif; white-space: nowrap;
    }
    #eh-reader-status {
      z-index: 2147483647; box-sizing: border-box;
      right: calc(var(--ehr-edge) + 76px); bottom: calc(var(--ehr-edge) + 4px);
      max-width: min(340px, calc(100vw - var(--ehr-edge) - 96px)); pointer-events: none;
    }
    #eh-reader-status:empty { display: none; }
    @media (max-width: 900px) { #${toolbarId}, #eh-reader-status { --ehr-edge: 18px; } }
    @media (max-width: 520px) { #${toolbarId}, #eh-reader-status { --ehr-edge: 12px; } }
    #${toolbarId}[hidden], #${toolbarId} [hidden] { display: none; }
    `
  }

  /** @type {Record<string, string>} */
  const iconPaths = {
    in: "M12 5v14M5 12h14",
    out: "M5 12h14",
    width: "M4 4v16M20 4v16M8 12h8m-5-3-3 3 3 3m2-6 3 3-3 3",
    height: "M4 4h16M4 20h16M12 8v8m-3-5 3-3 3 3m-6 2 3 3 3-3",
    reset: "M3 4v5h5M3.6 9a8.5 8.5 0 1 1 .5 7",
    page: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5",
    resume: "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4zM9 10h6m-3-3 3 3-3 3",
    start:
      "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0zM14.3 10a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0",
    clear:
      "M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14M10 10v7M14 10v7",
  }

  /** @param {string} name */
  function createIcon(name) {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    icon.setAttribute("viewBox", "0 0 24 24")
    icon.setAttribute("aria-hidden", "true")
    icon.setAttribute("focusable", "false")
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
    path.setAttribute("d", iconPaths[name])
    icon.append(path)
    return icon
  }

  /** @param {string} action @param {string} label @param {string} [shortcut] */
  function createButton(action, label, shortcut = "") {
    const button = document.createElement("button")
    button.type = "button"
    button.dataset.action = action
    button.setAttribute("aria-label", label)
    if (shortcut) button.dataset.shortcut = shortcut
    button.append(createIcon(action))
    return button
  }

  /** @param {...Node} elements */
  function createGroup(...elements) {
    const group = document.createElement("div")
    group.className = "eh-reader-group"
    group.append(...elements)
    return group
  }

  function createDivider() {
    const divider = document.createElement("span")
    divider.className = "eh-reader-divider"
    divider.setAttribute("aria-hidden", "true")
    return divider
  }

  function createToolbar() {
    const toolbar = document.createElement("div")
    toolbar.id = toolbarId
    toolbar.setAttribute("role", "group")
    toolbar.setAttribute("aria-label", "E-Hentai Reader 閱讀控制")
    toolbar.hidden = true
    const controls = document.createElement("div")
    controls.className = "eh-reader-controls"
    const status = document.createElement("span")
    status.id = "eh-reader-status"
    status.className = "eh-reader-status"
    status.setAttribute("role", "status")
    const tooltip = document.createElement("div")
    tooltip.id = "eh-reader-tooltip"
    tooltip.className = "eh-reader-tooltip"
    tooltip.setAttribute("role", "tooltip")
    tooltip.hidden = true
    const tooltipLabel = document.createElement("span")
    const tooltipShortcut = document.createElement("kbd")
    tooltip.append(tooltipLabel, tooltipShortcut)

    toolbar.append(controls, tooltip)
    document.body.append(toolbar, status)
    /** @type {HTMLButtonElement | HTMLAnchorElement | null} */
    let tooltipControl = null
    let statusTimer = 0

    /** @param {string} message @param {boolean} [transient] */
    function showStatus(message, transient = false) {
      clearTimeout(statusTimer)
      status.textContent = message
      if (transient)
        statusTimer = window.setTimeout(() => {
          status.textContent = ""
        }, 2800)
    }

    function hideTooltip() {
      tooltip.hidden = true
      tooltipControl?.removeAttribute("aria-describedby")
      tooltipControl = null
    }

    /** @param {HTMLButtonElement | HTMLAnchorElement} control */
    function showTooltip(control) {
      if (
        !control.isConnected ||
        control.closest("[hidden]") ||
        (control instanceof HTMLButtonElement && control.disabled)
      ) {
        hideTooltip()
        return
      }
      if (tooltipControl !== control) hideTooltip()
      tooltipControl = control
      const label = control.getAttribute("aria-label") ?? ""
      if (tooltipLabel.textContent !== label) tooltipLabel.textContent = label
      const shortcut = control.dataset.shortcut ?? ""
      if (tooltipShortcut.textContent !== shortcut) tooltipShortcut.textContent = shortcut
      tooltipShortcut.hidden = !shortcut
      tooltip.hidden = false
      control.setAttribute("aria-describedby", tooltip.id)
      const rect = control.getBoundingClientRect()
      const bounds = tooltip.getBoundingClientRect()
      const height = document.documentElement.clientHeight || innerHeight
      tooltip.style.left = `${Math.max(8, toolbar.getBoundingClientRect().left - bounds.width - 12)}px`
      tooltip.style.top = `${Math.max(8, Math.min(height - bounds.height - 8, rect.top + (rect.height - bounds.height) / 2))}px`
    }

    /** @param {EventTarget | null} target */
    function tooltipTarget(target) {
      const control = target instanceof Element ? target.closest("button, a") : null
      return control instanceof HTMLButtonElement || control instanceof HTMLAnchorElement
        ? control
        : null
    }

    function updateTooltip() {
      if (tooltipControl) showTooltip(tooltipControl)
    }

    /** @param {Node} target */
    function owns(target) {
      return toolbar.contains(target) || status.contains(target)
    }

    const controller = new AbortController()
    const signal = controller.signal
    toolbar.addEventListener(
      "pointerover",
      (event) => {
        const control = tooltipTarget(event.target)
        if (control) showTooltip(control)
      },
      { signal },
    )
    toolbar.addEventListener(
      "pointerout",
      (event) => {
        const control = tooltipTarget(event.target)
        if (
          !control ||
          (event.relatedTarget instanceof Node && control.contains(event.relatedTarget))
        )
          return
        if (!control.matches(":focus-visible")) hideTooltip()
      },
      { signal },
    )
    toolbar.addEventListener(
      "focusin",
      (event) => {
        const control = tooltipTarget(event.target)
        if (control) showTooltip(control)
      },
      { signal },
    )
    toolbar.addEventListener("focusout", hideTooltip, { signal })
    controls.addEventListener(
      "scroll",
      () => {
        if (
          tooltipControl === document.activeElement &&
          tooltipControl?.matches(":focus-visible")
        ) {
          const rect = tooltipControl.getBoundingClientRect()
          const bounds = controls.getBoundingClientRect()
          // Tab can scroll a focused control into view after its focus event.
          if (rect.bottom > bounds.top && rect.top < bounds.bottom) {
            showTooltip(tooltipControl)
            return
          }
        }
        hideTooltip()
      },
      { passive: true, signal },
    )

    window.addEventListener("resize", hideTooltip, { signal })
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") hideTooltip()
      },
      { signal },
    )
    const observer = new MutationObserver(() => {
      if (
        tooltipControl &&
        (!tooltipControl.isConnected ||
          tooltipControl.closest("[hidden]") ||
          (tooltipControl instanceof HTMLButtonElement && tooltipControl.disabled))
      )
        hideTooltip()
    })
    observer.observe(toolbar, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["hidden", "disabled"],
    })

    function destroy() {
      clearTimeout(statusTimer)
      controller.abort()
      observer.disconnect()
      hideTooltip()
      toolbar.remove()
      status.remove()
    }

    return { toolbar, controls, showStatus, hideTooltip, updateTooltip, owns, destroy }
  }

  function startGalleryProgress() {
    if (
      !/^\/g\/[1-9]\d*\/[a-z0-9]+\/?$/i.test(location.pathname) &&
      !document.querySelector('a[href*="/g/"], #gn')
    )
      return () => {}
    const style = document.createElement("style")
    style.id = styleId
    style.textContent = `
      .eh-reader-progress { display: inline-block; margin: 4px 8px; white-space: nowrap;
        font: 13px/1.4 system-ui, sans-serif; }
      ${toolbarCss()}
    `
    document.head.append(style)
    const { toolbar, controls, showStatus, hideTooltip, updateTooltip, owns, destroy } =
      createToolbar()
    const resume = document.createElement("a")
    resume.dataset.action = "resume"
    resume.setAttribute("aria-label", "繼續閱讀")
    const pageBadge = document.createElement("span")
    pageBadge.className = "eh-reader-page-badge"
    pageBadge.setAttribute("aria-hidden", "true")
    resume.append(createIcon("resume"), pageBadge)
    const resumeGroup = document.createElement("div")
    resumeGroup.className = "eh-reader-resume-group"
    resumeGroup.hidden = true
    resumeGroup.append(resume, createDivider())
    const clear = createButton("clear", "清除閱讀紀錄")
    controls.append(resumeGroup, clear)
    /** @type {Map<Element, HTMLAnchorElement>} */
    const badges = new Map()
    let frame = 0

    function refresh() {
      const galleryId = location.pathname.match(/^\/g\/([1-9]\d*)\/[a-z0-9]+\/?$/i)?.[1]
      const progress = galleryId ? readProgress(galleryId) : null
      resume.hidden = resumeGroup.hidden = !progress
      if (progress) {
        resume.setAttribute("aria-label", `繼續閱讀：第 ${progress.page} 頁`)
        const href = resumeHref(progress)
        if (resume.getAttribute("href") !== href) resume.setAttribute("href", href)
        if (pageBadge.textContent !== String(progress.page))
          pageBadge.textContent = String(progress.page)
      } else {
        resume.removeAttribute("href")
        pageBadge.textContent = ""
      }
      /** @type {Map<Element, string>} */
      const targets = new Map()
      // Keep per-title list links, but put the current gallery's resume only in the toolbar.
      for (const title of document.querySelectorAll(".glink")) {
        const link = title.closest("a[href]")
        if (!(link instanceof HTMLAnchorElement) || !title.textContent?.trim()) continue
        const url = localUrl(link.getAttribute("href") ?? "")
        const match = url?.pathname.match(/^\/g\/([1-9]\d*)\/[a-z0-9]+\/?$/i)
        if (match && match[1] !== galleryId) targets.set(link, match[1])
      }
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
        const href = resumeHref(progress)
        if (badge.getAttribute("href") !== href) badge.setAttribute("href", href)
      }
      toolbar.hidden = !progress && badges.size === 0 && !storageError
      if (storageError) showStatus("無法使用本機儲存。")
      updateTooltip()
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
        hideTooltip()
        if (clearProgress()) showStatus("已清除本站閱讀紀錄。", true)
        refresh()
      },
      { signal },
    )
    window.addEventListener("storage", schedule, { signal })
    window.addEventListener("popstate", schedule, { signal })
    const observer = new MutationObserver((records) => {
      if (records.some((record) => !owns(record.target))) schedule()
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "class"],
    })
    refresh()
    return () => {
      controller.abort()
      observer.disconnect()
      cancelAnimationFrame(frame)
      for (const badge of badges.values()) badge.remove()
      destroy()
      style.remove()
    }
  }

  const reader = readerLocation(location.pathname)
  if (!reader) return startGalleryProgress()
  let gallery = reader
  const request = readResumeRequest()
  const continuing = takeContinuation(gallery.path)
  const mpv = gallery.mpv
  const minScale = 0.1
  const maxScale = 8
  /** @typedef {{element: HTMLElement, image: HTMLImageElement | null, width: number, height: number}} Page */
  /** @typedef {{node: Element, x: number, y: number, rx: number, ry: number}} Anchor */
  /** @type {Map<HTMLElement, Page>} */
  let pages = new Map()
  const preference = readPreference(gallery.id)
  /** @type {ViewMode} */
  let mode = preference.mode
  let manualScale = mode === "manual" ? preference.scale : 1
  let pendingProgress = request?.progress ?? (continuing ? null : readProgress(gallery.id))
  let recording = !pendingProgress
  let resumeRequested = Boolean(request)
  /** @type {Progress | null} */
  let restoredProgress = null
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
    ${toolbarCss()}
  `
  const style = document.createElement("style")
  style.id = styleId
  style.textContent = css
  document.head.append(style)

  const { toolbar, controls, showStatus, hideTooltip, updateTooltip, owns, destroy } =
    createToolbar()
  const position = document.createElement("span")
  position.id = "eh-reader-position"
  position.setAttribute("role", "img")
  const positionNumber = document.createElement("span")
  position.append(createIcon("page"), positionNumber)
  const output = document.createElement("output")
  output.setAttribute("aria-label", "圖片縮放比例")
  output.setAttribute("aria-live", "polite")
  const zoomIn = createButton("in", "放大圖片", "+")
  const zoomOut = createButton("out", "縮小圖片", "−")
  const fitWidth = createButton("width", "適合閱讀區寬度", "Shift + W")
  const fitHeight = createButton("height", "適合閱讀區高度", "Shift + H")
  const reset = createButton("reset", "還原原站圖片尺寸", "0")
  const buttons = new Map([
    ["in", zoomIn],
    ["out", zoomOut],
    ["width", fitWidth],
    ["height", fitHeight],
    ["reset", reset],
  ])
  const resume = document.createElement("a")
  resume.dataset.action = "resume"
  resume.append(createIcon("resume"))
  const startHere = createButton("start", "從此處閱讀")
  const resumeGroup = document.createElement("div")
  resumeGroup.className = "eh-reader-resume-group"
  resumeGroup.append(createDivider(), createGroup(resume, startHere))
  const clear = createButton("clear", "清除閱讀紀錄")
  controls.append(
    position,
    createDivider(),
    createGroup(zoomIn, output, zoomOut),
    createDivider(),
    createGroup(fitWidth, fitHeight, reset),
    resumeGroup,
    createDivider(),
    clear,
  )

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
    if (positionNumber.textContent !== String(number)) positionNumber.textContent = String(number)
    position.setAttribute("aria-label", label)
    position.title = label
    resume.hidden = startHere.hidden = resumeGroup.hidden = !pendingProgress
    if (pendingProgress) {
      const text = `繼續閱讀：第 ${pendingProgress.page} 頁`
      resume.setAttribute("aria-label", text)
      const href = resumeHref(pendingProgress, mpv ? gallery.path : pendingProgress.path)
      if (resume.getAttribute("href") !== href) resume.setAttribute("href", href)
    }
    if (storageError) showStatus("無法使用本機儲存；變更不會保存。")
    updateTooltip()
  }

  function refresh() {
    syncLocation()
    const anchor =
      mode === "native" || resumeRequested || restoredProgress ? null : anchorFor(currentPage())
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
    if (resumeRequested || restoredProgress) resumeProgress()
    scheduleProgress()
  }

  function scheduleRefresh() {
    if (stopped) return
    // Background tabs can suspend animation frames while native MPV images load.
    if (resumeRequested && document.hidden) {
      cancelAnimationFrame(frame)
      frame = 0
      refresh()
      return
    }
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      refresh()
    })
  }

  /** @param {number} scale @param {Anchor | null} anchor */
  function zoomTo(scale, anchor) {
    restoredProgress = null
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
      hideTooltip()
      if (clearProgress()) {
        pendingProgress = null
        recording = false
        resumeRequested = false
        restoredProgress = null
        clearTimeout(progressTimer)
        clearResumeRequest()
        showStatus("已清除本站閱讀紀錄。", true)
      }
      updateControls()
      return
    }
    refresh()
    const page = currentPage()
    if (!page) return
    restoredProgress = null
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
      const request = readResumeRequest()
      const continuing = takeContinuation(next.path)
      if (changedGallery || request) {
        pendingProgress = request?.progress ?? readProgress(next.id)
        recording = !pendingProgress
      }
      if (continuing) {
        pendingProgress = null
        recording = true
      }
      resumeRequested = Boolean(request)
      restoredProgress = null
      if (changedGallery) {
        const preference = readPreference(gallery.id)
        mode = preference.mode
        manualScale = mode === "manual" ? preference.scale : 1
        render()
      } else updateControls()
    }
    return true
  }

  /** @param {string} id @returns {{mode: ViewMode, scale: number}} */
  function readPreference(id) {
    for (const key of [`${preferenceKey}:${id}`, preferenceKey]) {
      const value = readStored(key)
      if (
        value &&
        ["native", "manual", "width", "height"].includes(value.mode) &&
        Number.isFinite(value.scale) &&
        value.scale >= minScale &&
        value.scale <= maxScale
      )
        return { mode: value.mode, scale: value.scale }
    }
    return { mode: "native", scale: 1 }
  }

  function savePreference() {
    if (!syncLocation()) return
    writeStored(`${preferenceKey}:${gallery.id}`, {
      mode,
      scale: mode === "manual" ? manualScale : 1,
    })
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
    if (!recording || restoredProgress || !page) return
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
    if (!recording || restoredProgress || stopped) return
    clearTimeout(progressTimer)
    progressTimer = window.setTimeout(saveProgress, 300)
  }

  function beginReading() {
    if (!pages.size) return
    pendingProgress = null
    resumeRequested = false
    restoredProgress = null
    recording = true
    clearResumeRequest()
    updateControls()
    scheduleProgress()
  }

  function resumeProgress() {
    const progress = pendingProgress ?? restoredProgress
    if (!progress) return
    const target = mpv
      ? [...pages.values()].find((page) => pageNumber(page) === progress.page)
      : gallery.page === progress.page
        ? currentPage()
        : null
    if (!target) return
    const rect = readingRect(target)
    if (!(rect.height > 0)) return
    const scroller = view().pane ?? document.scrollingElement ?? document.documentElement
    scroller.scrollTop += rect.top + rect.height * progress.offset - view().top - 4
    // Scrolling an MPV placeholder triggers native loading. Its final size can differ.
    if (mpv && !target.image?.isConnected) return
    if (mpv && location.hash !== `#page${progress.page}`)
      history.replaceState(
        history.state,
        "",
        `${location.pathname}${location.search}#page${progress.page}`,
      )
    if (restoredProgress) {
      updateControls()
      return
    }
    beginReading()
    if (mpv) {
      // Native startup and late image layout must not replace an explicit resume.
      // Keep its anchor until reading input or a view control selects a new position.
      restoredProgress = progress
      writeStored(progressPrefix + gallery.id, { ...progress, path: gallery.path })
      updateControls()
    } else saveProgress()
  }

  /** @param {Event} event */
  function onReadingInput(event) {
    if (
      event.defaultPrevented ||
      isEditable(event.target) ||
      (event.target instanceof Node &&
        toolbar.contains(event.target) &&
        (!restoredProgress || !(event instanceof KeyboardEvent)))
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
        !mpv &&
        url?.origin === location.origin &&
        url.pathname !== gallery.path &&
        !readerLocation(url.pathname)?.mpv &&
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
        restoredProgress = null
        clearTimeout(progressTimer)
        clearResumeRequest()
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
      if (restoredProgress) scheduleRefresh()
      else {
        updateControls()
        scheduleProgress()
      }
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
    if (records.some((record) => !owns(record.target))) scheduleRefresh()
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
    destroy()
    style.remove()
    pages.clear()
  }
})()
