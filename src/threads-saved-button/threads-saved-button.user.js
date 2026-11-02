// ==UserScript==
// @name         Threads Saved Button
// @namespace    userscripts/threads-saved-button
// @version      0.2.0
// @description  Add a saved-state bookmark after each Threads post's Share control.
// @match        https://www.threads.com/*
// @match        https://threads.com/*
// @match        https://www.threads.net/*
// @match        https://threads.net/*
// @downloadURL  https://raw.githubusercontent.com/narumiruna/userscripts/main/src/threads-saved-button/threads-saved-button.user.js
// @updateURL    https://raw.githubusercontent.com/narumiruna/userscripts/main/src/threads-saved-button/threads-saved-button.user.js
// @run-at       document-idle
// @grant        none
// @noframes
// @license      AGPL-3.0-only
// ==/UserScript==

// @ts-check

;(() => {
  // biome-ignore lint/suspicious/noRedundantUseStrict: Userscript managers run this as a classic script.
  "use strict"

  const PREFIX = "threads-saved-button"
  const TRIGGER_SELECTOR = 'button[aria-haspopup="menu"], [role="button"][aria-haspopup="menu"]'
  const MORE_LABELS = new Set(["more", "more options", "更多", "更多選項", "更多选项"])
  const SAVE_LABELS = new Set([
    "save",
    "unsave",
    "remove from saved",
    "儲存",
    "取消儲存",
    "保存",
    "取消保存",
    "收藏",
    "取消收藏",
  ])

  const SHARE_LABELS = new Set(["share", "share post", "分享", "分享貼文", "分享帖子"])
  const UNSAVE_LABELS = new Set(["unsave", "remove from saved", "取消儲存", "取消保存", "取消收藏"])

  /** @typedef {{button: HTMLButtonElement, code: string}} Shortcut */

  /** @param {Element} element */
  function labelOf(element) {
    const copy = element.cloneNode(true)
    if (!(copy instanceof Element)) return ""
    for (const svg of copy.querySelectorAll("svg")) svg.remove()
    const icon = element.querySelector("svg")
    return (
      element.getAttribute("aria-label") ||
      copy.textContent?.trim() ||
      icon?.getAttribute("aria-label") ||
      icon?.getAttribute("title") ||
      icon?.querySelector("title")?.textContent ||
      element.getAttribute("title") ||
      ""
    )
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
  }

  /** @param {HTMLElement} element */
  function isVisible(element) {
    if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false
    const style = getComputedStyle(element)
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    )
  }

  /** @param {HTMLElement} element */
  function isDisabled(element) {
    return element.matches(':disabled, [aria-disabled="true"]')
  }

  /**
   * @param {HTMLElement} trigger
   * @returns {HTMLElement | undefined}
   */
  function postHeader(trigger) {
    if (!MORE_LABELS.has(labelOf(trigger))) return
    if (trigger.closest('nav, aside, [role="navigation"]')) return

    // Stay near the trigger. Do not mistake a page-level menu for a post menu.
    let parent = trigger.parentElement
    for (let depth = 0; parent && depth < 6; depth++, parent = parent.parentElement) {
      const links = [...parent.querySelectorAll('a[href*="/post/"]')]
        .filter((link) => link instanceof HTMLAnchorElement)
        .filter((link) => link.querySelector("time"))
      if (links.length === 0) continue
      const posts = new Set(links.map((link) => new URL(link.href).pathname))
      if (posts.size === 1 && parent.querySelectorAll(TRIGGER_SELECTOR).length === 1) return parent
      return
    }
  }

  /**
   * @param {HTMLElement} trigger
   * @returns {{code: string, row: HTMLElement, share: HTMLElement} | undefined}
   */
  function postActions(trigger) {
    const header = postHeader(trigger)
    if (!header) return
    const link = header.querySelector('a[href*="/post/"]:has(time)')
    if (!(link instanceof HTMLAnchorElement)) return
    const code = new URL(link.href).pathname.match(/\/post\/([^/]+)/)?.[1]
    if (!code) return

    let root = header.parentElement
    for (
      let depth = 0;
      root && root !== document.body && depth < 5;
      depth++, root = root.parentElement
    ) {
      // Do not attach an outer post's shortcut to a quoted or adjacent post.
      if (root.querySelectorAll(TRIGGER_SELECTOR).length !== 1) return
      const shares = [...root.querySelectorAll("svg")]
        .filter((icon) => SHARE_LABELS.has(labelOf(icon)))
        .map((icon) => icon.closest('button, [role="button"]'))
        .filter((control) => control instanceof HTMLElement)
      if (shares.length === 0) continue
      if (shares.length !== 1) return
      const share = shares[0]
      if (!share) return

      let row = share.parentElement
      for (
        let level = 0;
        row && root.contains(row) && level < 4;
        level++, row = row.parentElement
      ) {
        if (row.contains(trigger)) return
        const controls = [...row.querySelectorAll('button, [role="button"]')].filter(
          (control) => !control.classList.contains(PREFIX) && control.querySelector("svg"),
        )
        if (controls.length < 3) continue
        let branch = share
        while (branch.parentElement && branch.parentElement !== row) branch = branch.parentElement
        return { code, row, share: branch }
      }
      return
    }
  }

  function visibleMenus() {
    return [...document.querySelectorAll('[role="menu"]')]
      .filter((menu) => menu instanceof HTMLElement)
      .filter(isVisible)
  }

  /**
   * @param {HTMLElement} trigger
   * @returns {HTMLElement | undefined}
   */
  function saveItem(trigger) {
    let menus = visibleMenus()
    const controls = trigger.getAttribute("aria-controls")?.trim()
    if (controls) {
      const owners = controls.split(/\s+/).map((id) => document.getElementById(id))
      menus = menus.filter((menu) => owners.some((owner) => owner?.contains(menu)))
    }
    if (menus.length !== 1) return
    const menu = menus[0]
    if (!menu) return
    const items = menu.querySelectorAll('[role="menuitem"]')
    const candidates = items.length ? items : menu.querySelectorAll('button, [role="button"]')
    const matches = [...candidates]
      .filter((item) => item instanceof HTMLElement)
      .filter((item) => isVisible(item) && !isDisabled(item) && SAVE_LABELS.has(labelOf(item)))
    return matches.length === 1 ? matches[0] : undefined
  }

  /**
   * @param {HTMLElement} trigger
   * @param {AbortSignal} signal
   * @param {string} url
   * @returns {Promise<HTMLElement>}
   */
  function waitForSaveItem(trigger, signal, url) {
    return new Promise((resolve, reject) => {
      let opened = false
      const observer = new MutationObserver(check)
      const timeout = window.setTimeout(
        () => finish(new Error("Save action unavailable. Check the native post menu or sign in.")),
        2500,
      )

      /** @param {HTMLElement | Error} result */
      function finish(result) {
        observer.disconnect()
        window.clearTimeout(timeout)
        signal.removeEventListener("abort", cancel)
        if (result instanceof Error) reject(result)
        else resolve(result)
      }

      function cancel() {
        finish(new Error("Save action cancelled."))
      }

      function check() {
        if (signal.aborted || !trigger.isConnected || location.href !== url) return cancel()
        const expanded = trigger.getAttribute("aria-expanded") === "true"
        if (opened && !expanded) return cancel()
        opened ||= expanded
        if (!expanded) return
        const item = saveItem(trigger)
        if (item) finish(item)
      }

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      })
      signal.addEventListener("abort", cancel, { once: true })
      check()
    })
  }

  /**
   * Read only explicit post flags. Null or missing flags do not mean unsaved.
   * @param {Map<string, boolean>} states
   * @param {WeakMap<HTMLScriptElement, string>} parsed
   */
  function readSavedData(states, parsed) {
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      if (!(script instanceof HTMLScriptElement)) continue
      const text = script.textContent || ""
      if (parsed.get(script) === text || !text.includes('"has_viewer_saved"')) continue
      parsed.set(script, text)
      /** @type {unknown[]} */
      let pending
      try {
        pending = [JSON.parse(text)]
      } catch {
        continue
      }
      while (pending.length) {
        const value = pending.pop()
        if (!value || typeof value !== "object") continue
        const record = /** @type {Record<string, unknown>} */ (value)
        if (typeof record.code === "string" && typeof record.has_viewer_saved === "boolean") {
          states.set(record.code, record.has_viewer_saved)
        }
        for (const child of Object.values(record)) {
          if (child && typeof child === "object") pending.push(child)
        }
      }
    }
  }

  function startThreadsSavedButton() {
    if (document.getElementById(`${PREFIX}-style`)) return () => {}

    const style = document.createElement("style")
    style.id = `${PREFIX}-style`
    style.textContent = `
      .${PREFIX} {
        display: inline-flex; align-items: center; justify-content: center;
        flex: 0 0 28px; width: 28px; height: 28px; padding: 4px;
        margin-inline-start: 8px; align-self: center; border: 0; border-radius: 6px;
        background: transparent;
        color: var(--barcelona-charcoal-icon, var(--barcelona-secondary-icon, #777));
        cursor: pointer; vertical-align: middle;
      }
      .${PREFIX}:hover { background: var(--barcelona-hovered-background, #8882); }
      .${PREFIX}:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
      .${PREFIX}:disabled { opacity: .5; cursor: wait; }
      #${PREFIX}-status {
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        z-index: 2147483647; max-width: min(480px, 90vw); box-sizing: border-box;
        padding: 10px 14px; border-radius: 8px; background: #222; color: #fff;
        font: 14px/1.4 system-ui; pointer-events: none;
      }
    `
    document.head.append(style)

    const status = document.createElement("div")
    status.id = `${PREFIX}-status`
    status.setAttribute("role", "status")
    status.hidden = true
    document.body.append(status)

    /** @type {Map<HTMLElement, Shortcut>} */
    const buttons = new Map()
    /** @type {Map<string, boolean>} */
    const states = new Map()
    /** @type {WeakMap<HTMLScriptElement, string>} */
    const parsedScripts = new WeakMap()
    /** @type {WeakMap<HTMLElement, string>} */
    const menuCodes = new WeakMap()
    let currentUrl = location.href
    let stopped = false
    /** @type {number | undefined} */
    let refreshTimer
    /** @type {number | undefined} */
    let statusTimer
    /** @type {AbortController | undefined} */
    let active

    /** @param {Shortcut} shortcut */
    function renderState(shortcut) {
      const { button, code } = shortcut
      const saved = states.get(code)
      const value = saved === undefined ? "unknown" : String(saved)
      if (button.dataset.saved === value) return
      button.dataset.saved = value
      button.title =
        saved === undefined ? "Save / unsave (state unavailable)" : saved ? "Unsave" : "Save"
      button.setAttribute("aria-label", button.title)
      if (saved === undefined) button.removeAttribute("aria-pressed")
      else button.setAttribute("aria-pressed", String(saved))
      const path = button.querySelector("path")
      path?.setAttribute("fill", saved ? "currentColor" : "none")
      if (saved === undefined) path?.setAttribute("stroke-dasharray", "2 2")
      else path?.removeAttribute("stroke-dasharray")
    }

    /**
     * @param {string} code
     * @param {boolean} saved
     */
    function setSaved(code, saved) {
      states.set(code, saved)
      for (const shortcut of buttons.values()) {
        if (shortcut.code === code) renderState(shortcut)
      }
    }

    function openShortcut() {
      const open = [...buttons].filter(
        ([trigger]) => trigger.isConnected && trigger.getAttribute("aria-expanded") === "true",
      )
      const entry = open.length === 1 ? open[0] : undefined
      if (!entry) return
      const [trigger, shortcut] = entry
      const origin = menuCodes.get(trigger)
      if (origin !== undefined && origin !== shortcut.code) return
      menuCodes.set(trigger, shortcut.code)
      return entry
    }

    function syncOpenMenu() {
      if (active) return
      const open = openShortcut()
      if (!open) return
      const [trigger, shortcut] = open
      const item = saveItem(trigger)
      if (item) setSaved(shortcut.code, UNSAVE_LABELS.has(labelOf(item)))
    }

    /** @param {MouseEvent} event */
    function trackNativeAction(event) {
      if (!(event.target instanceof Element)) return
      const trigger = event.target.closest(TRIGGER_SELECTOR)
      if (
        trigger instanceof HTMLElement &&
        buttons.has(trigger) &&
        trigger.getAttribute("aria-expanded") !== "true"
      ) {
        const layout = postActions(trigger)
        if (layout) menuCodes.set(trigger, layout.code)
      }
      if (active) return
      const open = openShortcut()
      if (!open) return
      const [owner, shortcut] = open
      const item = saveItem(owner)
      if (item?.contains(event.target)) setSaved(shortcut.code, !UNSAVE_LABELS.has(labelOf(item)))
    }

    /** @param {string} message */
    function report(message) {
      status.textContent = message
      status.hidden = false
      window.clearTimeout(statusTimer)
      statusTimer = window.setTimeout(() => {
        status.hidden = true
      }, 4000)
    }

    /**
     * @param {HTMLElement} trigger
     * @param {Shortcut} shortcut
     */
    async function toggle(trigger, shortcut) {
      if (active || !trigger.isConnected || isDisabled(trigger)) return
      const layout = postActions(trigger)
      if (!layout) return
      const { button } = shortcut
      const code = layout.code
      shortcut.code = code
      renderState(shortcut)
      if (
        visibleMenus().length ||
        [...document.querySelectorAll(TRIGGER_SELECTOR)].some(
          (element) => element.getAttribute("aria-expanded") === "true",
        )
      ) {
        report("Close the open menu and try again.")
        return
      }

      const controller = new AbortController()
      active = controller
      const cancel = () => controller.abort()
      const url = location.href
      button.disabled = true
      button.setAttribute("aria-busy", "true")
      document.addEventListener("pointerdown", cancel, true)
      document.addEventListener("keydown", cancel, true)
      window.addEventListener("popstate", cancel)

      try {
        trigger.click()
        const item = await waitForSaveItem(trigger, controller.signal, url)
        if (
          controller.signal.aborted ||
          location.href !== url ||
          !trigger.isConnected ||
          trigger.getAttribute("aria-expanded") !== "true" ||
          saveItem(trigger) !== item ||
          postActions(trigger)?.code !== code
        ) {
          throw new Error("Save action cancelled.")
        }
        const label = labelOf(item)
        setSaved(code, UNSAVE_LABELS.has(label))
        item.click()
        setSaved(code, !UNSAVE_LABELS.has(label))
        // The icon is optimistic until new page data or the native menu confirms it.
        report(`Threads action requested: ${label}.`)
      } catch (error) {
        if (!stopped) report(error instanceof Error ? error.message : "Save action failed.")
      } finally {
        document.removeEventListener("pointerdown", cancel, true)
        document.removeEventListener("keydown", cancel, true)
        window.removeEventListener("popstate", cancel)
        button.disabled = false
        button.removeAttribute("aria-busy")
        active = undefined
      }
    }

    function refresh() {
      if (currentUrl !== location.href) {
        currentUrl = location.href
        states.clear()
      }
      readSavedData(states, parsedScripts)
      for (const [trigger, shortcut] of buttons) {
        if (!trigger.isConnected || !shortcut.button.isConnected) {
          shortcut.button.remove()
          buttons.delete(trigger)
        }
      }

      for (const trigger of document.querySelectorAll(TRIGGER_SELECTOR)) {
        if (!(trigger instanceof HTMLElement)) continue
        const layout = postActions(trigger)
        let shortcut = buttons.get(trigger)
        if (!layout) {
          shortcut?.button.remove()
          buttons.delete(trigger)
          continue
        }
        if (!shortcut) {
          const button = document.createElement("button")
          button.type = "button"
          button.className = PREFIX
          const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg")
          icon.setAttribute("viewBox", "0 0 24 24")
          icon.setAttribute("width", "20")
          icon.setAttribute("height", "20")
          icon.setAttribute("aria-hidden", "true")
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
          path.setAttribute("d", "M6 3h12v18l-6-4-6 4V3Z")
          path.setAttribute("fill", "none")
          path.setAttribute("stroke", "currentColor")
          path.setAttribute("stroke-width", "1.8")
          path.setAttribute("stroke-linejoin", "round")
          icon.append(path)
          button.append(icon)
          const created = { button, code: layout.code }
          button.addEventListener("click", (event) => {
            event.preventDefault()
            event.stopPropagation()
            void toggle(trigger, created)
          })
          shortcut = created
          buttons.set(trigger, shortcut)
        }
        shortcut.code = layout.code
        if (
          shortcut.button.parentElement !== layout.row ||
          shortcut.button.previousElementSibling !== layout.share
        ) {
          layout.share.after(shortcut.button)
        }
        renderState(shortcut)
      }
      syncOpenMenu()
    }

    document.addEventListener("click", trackNativeAction, true)
    const observer = new MutationObserver(() => {
      if (refreshTimer !== undefined) return
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined
        if (!stopped) refresh()
      }, 50)
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: [
        "aria-haspopup",
        "aria-expanded",
        "aria-controls",
        "aria-label",
        "title",
        "href",
        "role",
      ],
    })
    refresh()

    return () => {
      stopped = true
      observer.disconnect()
      active?.abort()
      window.clearTimeout(refreshTimer)
      window.clearTimeout(statusTimer)
      document.removeEventListener("click", trackNativeAction, true)
      for (const shortcut of buttons.values()) shortcut.button.remove()
      buttons.clear()
      states.clear()
      style.remove()
      status.remove()
    }
  }

  return startThreadsSavedButton()
})()
