// ==UserScript==
// @name         Threads Saved Button
// @namespace    userscripts/threads-saved-button
// @version      0.1.1
// @description  Add a save/unsave shortcut beside each Threads post menu.
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

  function startThreadsSavedButton() {
    if (document.getElementById(`${PREFIX}-style`)) return () => {}

    const style = document.createElement("style")
    style.id = `${PREFIX}-style`
    style.textContent = `
      .${PREFIX} {
        display: inline-flex; align-items: center; justify-content: center;
        flex: 0 0 28px; width: 28px; height: 28px; padding: 4px;
        margin-inline-end: 4px; border: 0; border-radius: 6px;
        background: transparent; color: var(--barcelona-secondary-icon, #777);
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

    /** @type {Map<HTMLElement, HTMLButtonElement>} */
    const buttons = new Map()
    let stopped = false
    /** @type {number | undefined} */
    let refreshTimer
    /** @type {number | undefined} */
    let statusTimer
    /** @type {AbortController | undefined} */
    let active

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
     * @param {HTMLButtonElement} button
     */
    async function toggle(trigger, button) {
      if (active || !trigger.isConnected || isDisabled(trigger)) return
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
          saveItem(trigger) !== item
        ) {
          throw new Error("Save action cancelled.")
        }
        const label = labelOf(item)
        item.click()
        // Dispatch is not confirmation of a successful server response.
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
      for (const [trigger, button] of buttons) {
        if (!trigger.isConnected || !button.isConnected || !postHeader(trigger)?.contains(button)) {
          button.remove()
          buttons.delete(trigger)
        }
      }

      for (const trigger of document.querySelectorAll(TRIGGER_SELECTOR)) {
        if (!(trigger instanceof HTMLElement) || buttons.has(trigger)) continue
        const header = postHeader(trigger)
        if (!header) continue

        const button = document.createElement("button")
        button.type = "button"
        button.className = PREFIX
        button.title = "Save / unsave"
        button.setAttribute("aria-label", "Save / unsave")
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
        button.addEventListener("click", (event) => {
          event.preventDefault()
          event.stopPropagation()
          void toggle(trigger, button)
        })

        let branch = trigger
        while (branch.parentElement && branch.parentElement !== header)
          branch = branch.parentElement
        if (branch === trigger) trigger.before(button)
        else branch.prepend(button)
        buttons.set(trigger, button)
      }
    }

    const observer = new MutationObserver(() => {
      if (refreshTimer !== undefined) return
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined
        if (!stopped) refresh()
      }, 50)
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-haspopup", "aria-label", "title", "href", "role"],
    })
    refresh()

    return () => {
      stopped = true
      observer.disconnect()
      active?.abort()
      window.clearTimeout(refreshTimer)
      window.clearTimeout(statusTimer)
      for (const button of buttons.values()) button.remove()
      buttons.clear()
      style.remove()
      status.remove()
    }
  }

  return startThreadsSavedButton()
})()
