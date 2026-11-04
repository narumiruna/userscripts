// ==UserScript==
// @name         Threads Saved Button
// @namespace    userscripts/threads-saved-button
// @version      0.2.2
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
  const SCRIPT_SELECTOR = 'script[type="application/json"]'
  const MENU_SELECTOR = '[role="menu"]'
  const POST_SELECTOR = 'a[href*="/post/"]:has(time)'
  const DISCOVERY_SELECTOR = `${TRIGGER_SELECTOR}, ${SCRIPT_SELECTOR}, ${MENU_SELECTOR}, ${POST_SELECTOR}`
  const STRUCTURE_SELECTOR = 'button, [role="button"], svg, time, a[href]'
  const OWN_SELECTOR = `.${PREFIX}, #${PREFIX}-style, #${PREFIX}-status`
  const DETACHED_LIMIT = 500
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

  /** @typedef {{code: string, root: HTMLElement, row: HTMLElement, share: HTMLElement}} Layout */
  /** @typedef {Layout & {button: HTMLButtonElement}} Shortcut */
  /** @typedef {{controller: AbortController, trigger: HTMLElement, shortcut: Shortcut, code: string, generation: number}} Operation */

  /** @param {string} text */
  function normalize(text) {
    return text.trim().replace(/\s+/g, " ").toLowerCase()
  }

  /** @param {Element} element */
  function labelOf(element) {
    const copy = element.cloneNode(true)
    if (!(copy instanceof Element)) return ""
    for (const svg of copy.querySelectorAll("svg")) svg.remove()
    const icon = element.querySelector("svg")
    return normalize(
      element.getAttribute("aria-label") ||
        copy.textContent?.trim() ||
        icon?.getAttribute("aria-label") ||
        icon?.getAttribute("title") ||
        icon?.querySelector("title")?.textContent ||
        element.getAttribute("title") ||
        "",
    )
  }

  /** @param {Element} control */
  function shareLabel(control) {
    const explicit = control.getAttribute("aria-label") || control.getAttribute("title")
    if (explicit) return normalize(explicit)
    // Counts are not labels. Inspect icons before the control's remaining text.
    return (
      [...control.querySelectorAll("svg")].map(labelOf).find((label) => SHARE_LABELS.has(label)) ||
      labelOf(control)
    )
  }

  /** @param {HTMLElement} element */
  function isVisible(element) {
    if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false
    const style = getComputedStyle(element)
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.visibility !== "collapse" &&
      element.getClientRects().length > 0
    )
  }

  /** @param {HTMLElement} element */
  function isDisabled(element) {
    return (
      element.matches(":disabled") || Boolean(element.closest('[aria-disabled="true"], [inert]'))
    )
  }

  /** @param {Element} root */
  function postMenus(root) {
    return [...root.querySelectorAll(TRIGGER_SELECTOR)]
      .filter((control) => control instanceof HTMLElement)
      .filter((control) => MORE_LABELS.has(labelOf(control)))
  }

  /** @param {Element} root */
  function postPaths(root) {
    return new Set(
      [...root.querySelectorAll(POST_SELECTOR)]
        .filter((link) => link instanceof HTMLAnchorElement)
        .map((link) => link.pathname),
    )
  }

  /** @param {HTMLElement} trigger */
  function isPostTrigger(trigger) {
    return MORE_LABELS.has(labelOf(trigger)) && !trigger.closest('nav, aside, [role="navigation"]')
  }

  /**
   * @param {HTMLElement} trigger
   * @param {Element} [boundary]
   */
  function postScope(trigger, boundary) {
    if (!isPostTrigger(trigger)) return
    for (
      let parent = trigger.parentElement;
      parent && parent !== document.body && (!boundary || boundary.contains(parent));
      parent = parent.parentElement
    ) {
      const posts = postPaths(parent)
      if (posts.size === 0) continue
      if (posts.size === 1 && postMenus(parent).length === 1) return parent
      return
    }
  }

  /**
   * @param {HTMLElement} trigger
   * @param {Element} [boundary]
   * @returns {Layout | undefined}
   */
  function postActions(trigger, boundary) {
    const scope = postScope(trigger, boundary)
    if (!scope) return
    const link = scope.querySelector(POST_SELECTOR)
    if (!(link instanceof HTMLAnchorElement)) return
    const code = link.pathname.match(/\/post\/([^/]+)/)?.[1]
    if (!code) return

    // The timestamp can be in the footer, so scope may already contain the row.
    /** @type {HTMLElement | null} */
    let root = scope
    for (
      ;
      root && root !== document.body && (!boundary || boundary.contains(root));
      root = root.parentElement
    ) {
      if (postPaths(root).size !== 1 || postMenus(root).length !== 1) return
      const shares = [...root.querySelectorAll('button, [role="button"]')]
        .filter((control) => control instanceof HTMLElement)
        .filter((control) => SHARE_LABELS.has(shareLabel(control)))
      if (shares.length === 0) continue
      if (shares.length !== 1) return
      const share = shares[0]
      if (!share) return
      for (let row = share.parentElement; row && root.contains(row); row = row.parentElement) {
        if (row.contains(trigger)) return
        const controls = [...row.querySelectorAll('button, [role="button"]')].filter(
          (control) => !control.classList.contains(PREFIX) && control.querySelector("svg"),
        )
        if (controls.length < 3) continue
        let branch = share
        while (branch.parentElement && branch.parentElement !== row) branch = branch.parentElement
        return { code, root, row, share: branch }
      }
      return
    }
  }

  function visibleMenus() {
    return [...document.querySelectorAll(MENU_SELECTOR)]
      .filter((menu) => menu instanceof HTMLElement)
      .filter(isVisible)
  }

  /** @param {HTMLElement} trigger */
  function ownedMenu(trigger) {
    const controls = trigger.getAttribute("aria-controls")?.trim()
    if (!controls) return
    /** @type {Set<HTMLElement>} */
    const menus = new Set()
    for (const id of new Set(controls.split(/\s+/))) {
      // Hex escapes also work for punctuation and non-ASCII IDs, without CSS.escape.
      const escaped = id.replace(
        /[^a-zA-Z0-9_-]/gu,
        (char) => `\\${char.codePointAt(0)?.toString(16)} `,
      )
      const owners = document.querySelectorAll(`[id="${escaped}"]`)
      if (owners.length !== 1) return
      const owner = owners[0]
      if (!(owner instanceof HTMLElement)) return
      const candidates = [
        ...(owner.matches(MENU_SELECTOR) ? [owner] : []),
        ...owner.querySelectorAll(MENU_SELECTOR),
      ]
        .filter((menu) => menu instanceof HTMLElement)
        .filter(isVisible)
      if (candidates.length !== 1) return
      const menu = candidates[0]
      if (menu) menus.add(menu)
    }
    const menu = menus.size === 1 ? [...menus][0] : undefined
    if (!menu) return
    const triggers = document.querySelectorAll(
      'button[aria-expanded="true"][aria-controls], [role="button"][aria-expanded="true"][aria-controls]',
    )
    for (const other of triggers) {
      if (other === trigger || !other.isConnected) continue
      const references = other.getAttribute("aria-controls")?.trim().split(/\s+/) || []
      if (references.some((id) => document.getElementById(id)?.contains(menu))) return
    }
    return menu
  }

  /** @param {HTMLElement} trigger */
  function saveItem(trigger) {
    const menu = ownedMenu(trigger)
    if (!menu || isDisabled(menu)) return
    const items = menu.querySelectorAll('[role="menuitem"]')
    const candidates = items.length ? items : menu.querySelectorAll('button, [role="button"]')
    const matches = [...candidates]
      .filter((item) => item instanceof HTMLElement)
      .filter((item) => isVisible(item) && !isDisabled(item) && SAVE_LABELS.has(labelOf(item)))
    return matches.length === 1 ? matches[0] : undefined
  }

  /**
   * Read only explicit flags from changed script nodes. Consumed snapshots stay consumed.
   * @param {HTMLScriptElement} script
   * @param {WeakMap<HTMLScriptElement, string>} parsed
   * @param {(code: string, saved: boolean) => void} setSaved
   */
  function readSavedScript(script, parsed, setSaved) {
    const text = script.textContent || ""
    if (parsed.get(script) === text) return
    parsed.set(script, text)
    if (!text.includes('"has_viewer_saved"')) return
    /** @type {unknown[]} */
    let pending
    try {
      pending = [JSON.parse(text)]
    } catch {
      return
    }
    while (pending.length) {
      const value = pending.pop()
      if (!value || typeof value !== "object") continue
      const record = /** @type {Record<string, unknown>} */ (value)
      if (typeof record.code === "string" && typeof record.has_viewer_saved === "boolean") {
        setSaved(record.code, record.has_viewer_saved)
      }
      for (const child of Object.values(record)) {
        if (child && typeof child === "object") pending.push(child)
      }
    }
  }

  function startThreadsSavedButton() {
    if (document.getElementById(`${PREFIX}-style`)) return () => {}
    const listeners = new AbortController()
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
    const status = document.createElement("div")
    status.id = `${PREFIX}-status`
    status.setAttribute("role", "status")
    status.hidden = true

    /** @type {Map<HTMLElement, Shortcut>} */
    const buttons = new Map()
    /** @type {WeakMap<HTMLButtonElement, HTMLElement>} */
    const buttonTriggers = new WeakMap()
    /** @type {Map<HTMLElement, Set<HTMLElement>>} */
    const roots = new Map()
    /** @type {Set<HTMLElement>} */
    const waiting = new Set()
    /** @type {Set<HTMLAnchorElement>} */
    const postLinks = new Set()
    /** @type {Map<string, Set<Shortcut>>} */
    const live = new Map()
    /** @type {Map<string, boolean>} */
    const states = new Map()
    /** @type {Set<string>} */
    const detached = new Set()
    /** @type {WeakMap<HTMLScriptElement, string>} */
    const parsedScripts = new WeakMap()
    /** @type {WeakMap<HTMLElement, {code: string, generation: number}>} */
    const menuCodes = new WeakMap()
    /** @type {Set<HTMLElement>} */
    const dirtyTriggers = new Set()
    /** @type {Set<Element>} */
    const dirtyContexts = new Set()
    /** @type {Set<HTMLScriptElement>} */
    const dirtyScripts = new Set()
    /** @type {Set<HTMLElement>} */
    const menus = new Set()
    let menuDirty = false
    let needsPrune = false
    let reconciling = false
    let fullDiscovery = true
    let currentUrl = location.href
    let generation = 0
    let stopped = false
    /** @type {number | undefined} */
    let refreshTimer
    /** @type {number | undefined} */
    let statusTimer
    /** @type {Operation | undefined} */
    let active
    /** @type {(() => void) | undefined} */
    let pendingCheck

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

    /** @param {string} code */
    function rememberDetached(code) {
      detached.delete(code)
      if (live.has(code) || !states.has(code)) return
      detached.add(code)
      if (!reconciling) trimDetached()
    }

    function trimDetached() {
      while (detached.size > DETACHED_LIMIT) {
        const oldest = detached.values().next().value
        if (oldest === undefined) break
        detached.delete(oldest)
        states.delete(oldest)
      }
    }

    /**
     * @param {string} code
     * @param {boolean} saved
     */
    function setSaved(code, saved) {
      states.set(code, saved)
      rememberDetached(code)
      for (const shortcut of live.get(code) || []) renderState(shortcut)
    }

    /** @param {Shortcut} shortcut */
    function unpin(shortcut) {
      const copies = live.get(shortcut.code)
      copies?.delete(shortcut)
      if (copies?.size === 0) live.delete(shortcut.code)
      rememberDetached(shortcut.code)
    }

    /** @param {Shortcut} shortcut */
    function pin(shortcut) {
      const copies = live.get(shortcut.code) || new Set()
      copies.add(shortcut)
      live.set(shortcut.code, copies)
      detached.delete(shortcut.code)
    }

    /** @param {Operation} operation */
    function release(operation) {
      operation.controller.abort()
      if (active !== operation) return
      operation.shortcut.button.disabled = false
      operation.shortcut.button.removeAttribute("aria-busy")
      active = undefined
    }

    function cancelActive() {
      if (active) release(active)
    }

    /** @param {HTMLElement} trigger */
    function removeShortcut(trigger) {
      const shortcut = buttons.get(trigger)
      if (!shortcut) return
      if (active?.shortcut === shortcut) cancelActive()
      const owners = roots.get(shortcut.root)
      owners?.delete(trigger)
      if (owners?.size === 0) roots.delete(shortcut.root)
      buttons.delete(trigger)
      buttonTriggers.delete(shortcut.button)
      unpin(shortcut)
      shortcut.button.remove()
    }

    function openShortcut() {
      const open = [...buttons].filter(
        ([trigger]) => trigger.isConnected && trigger.getAttribute("aria-expanded") === "true",
      )
      const entry = open.length === 1 ? open[0] : undefined
      if (!entry) return
      const [trigger, shortcut] = entry
      const origin = menuCodes.get(trigger)
      if (origin && (origin.code !== shortcut.code || origin.generation !== generation)) return
      menuCodes.set(trigger, { code: shortcut.code, generation })
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
    function trackClick(event) {
      if (stopped || !(event.target instanceof Element)) return
      const button = event.target.closest(`button.${PREFIX}`)
      if (button instanceof HTMLButtonElement) {
        const trigger = buttonTriggers.get(button)
        const shortcut = trigger && buttons.get(trigger)
        if (trigger && shortcut?.button === button) {
          event.preventDefault()
          event.stopPropagation()
          // A click can precede the pending mutation batch. Do not evict state
          // needed by another incoming post before that batch can pin it.
          reconciling = true
          try {
            reconcile(trigger)
          } finally {
            reconciling = false
            needsPrune = true
            schedule()
          }
          const current = buttons.get(trigger)
          if (current?.button === button) void toggle(trigger, current)
        }
        return
      }
      const trigger = event.target.closest(TRIGGER_SELECTOR)
      if (
        trigger instanceof HTMLElement &&
        buttons.has(trigger) &&
        trigger.getAttribute("aria-expanded") !== "true"
      ) {
        const layout = postActions(trigger)
        if (layout) menuCodes.set(trigger, { code: layout.code, generation })
      }
      if (active) return
      const open = openShortcut()
      if (!open) return
      const [owner, shortcut] = open
      const layout = postActions(owner)
      if (layout?.code !== shortcut.code) return
      const item = saveItem(owner)
      if (item?.contains(event.target)) setSaved(shortcut.code, !UNSAVE_LABELS.has(labelOf(item)))
    }

    /** @param {string} message */
    function report(message) {
      if (stopped) return
      status.textContent = message
      status.hidden = false
      window.clearTimeout(statusTimer)
      statusTimer = window.setTimeout(() => {
        status.hidden = true
      }, 4000)
    }

    /** @param {Operation} operation */
    function isCurrent(operation) {
      const { trigger, shortcut, controller, code } = operation
      if (
        stopped ||
        controller.signal.aborted ||
        active !== operation ||
        operation.generation !== generation ||
        currentUrl !== location.href ||
        buttons.get(trigger) !== shortcut ||
        !trigger.isConnected ||
        !shortcut.button.isConnected ||
        !isVisible(trigger) ||
        !isVisible(shortcut.button) ||
        isDisabled(trigger)
      ) {
        return false
      }
      const layout = postActions(trigger)
      return (
        layout?.code === code &&
        layout.root === shortcut.root &&
        layout.row === shortcut.row &&
        layout.share === shortcut.share &&
        shortcut.button.parentElement === layout.row
      )
    }

    /**
     * The document observer calls this waiter only for related mutations.
     * @param {Operation} operation
     * @returns {Promise<HTMLElement>}
     */
    function waitForSaveItem(operation) {
      return new Promise((resolve, reject) => {
        const { trigger, controller } = operation
        let opened = false
        let settled = false
        const timeout = window.setTimeout(
          () =>
            finish(new Error("Save action unavailable. Check the native post menu or sign in.")),
          2500,
        )
        /** @param {HTMLElement | Error} result */
        function finish(result) {
          if (settled) return
          settled = true
          window.clearTimeout(timeout)
          controller.signal.removeEventListener("abort", cancel)
          if (pendingCheck === check) pendingCheck = undefined
          if (result instanceof Error) reject(result)
          else resolve(result)
        }
        function cancel() {
          finish(new Error("Save action cancelled."))
        }
        function check() {
          if (!isCurrent(operation)) return cancel()
          const expanded = trigger.getAttribute("aria-expanded") === "true"
          if (opened && !expanded) return cancel()
          opened ||= expanded
          if (!expanded) return
          const item = saveItem(trigger)
          if (item) finish(item)
        }
        pendingCheck = check
        controller.signal.addEventListener("abort", cancel, { once: true })
        check()
      })
    }

    /**
     * @param {HTMLElement} trigger
     * @param {Shortcut} shortcut
     */
    async function toggle(trigger, shortcut) {
      if (
        stopped ||
        active ||
        buttons.get(trigger) !== shortcut ||
        !trigger.isConnected ||
        !shortcut.button.isConnected ||
        isDisabled(trigger)
      ) {
        return
      }
      const layout = postActions(trigger)
      if (!layout || layout.row !== shortcut.row || layout.code !== shortcut.code) return
      if (
        visibleMenus().length ||
        [...document.querySelectorAll(TRIGGER_SELECTOR)].some(
          (element) => element.getAttribute("aria-expanded") === "true",
        )
      ) {
        report("Close the open menu and try again.")
        return
      }
      const operation = {
        controller: new AbortController(),
        trigger,
        shortcut,
        code: layout.code,
        generation,
      }
      active = operation
      const { controller, code } = operation
      const cancel = () => controller.abort()
      shortcut.button.disabled = true
      shortcut.button.setAttribute("aria-busy", "true")
      document.addEventListener("pointerdown", cancel, { capture: true, signal: controller.signal })
      document.addEventListener("keydown", cancel, { capture: true, signal: controller.signal })
      try {
        if (!isCurrent(operation)) throw new Error("Save action cancelled.")
        trigger.click()
        const item = await waitForSaveItem(operation)
        if (
          !isCurrent(operation) ||
          trigger.getAttribute("aria-expanded") !== "true" ||
          saveItem(trigger) !== item
        ) {
          throw new Error("Save action cancelled.")
        }
        const label = labelOf(item)
        setSaved(code, UNSAVE_LABELS.has(label))
        item.click()
        if (isCurrent(operation)) {
          setSaved(code, !UNSAVE_LABELS.has(label))
          // This is an optimistic icon, not server confirmation.
          report(`Threads action requested: ${label}.`)
        }
      } catch (error) {
        if (!stopped && operation.generation === generation) {
          report(error instanceof Error ? error.message : "Save action failed.")
        }
      } finally {
        release(operation)
      }
    }

    /**
     * @param {HTMLElement} trigger
     * @param {Element} [boundary]
     */
    function reconcile(trigger, boundary) {
      waiting.delete(trigger)
      if (!trigger.isConnected || !trigger.matches(TRIGGER_SELECTOR)) {
        removeShortcut(trigger)
        return
      }
      const layout = postActions(trigger, boundary)
      // Reserve incoming state before retiring a different live code at capacity.
      if (layout) detached.delete(layout.code)
      let shortcut = buttons.get(trigger)
      if (
        shortcut &&
        (!layout ||
          !shortcut.button.isConnected ||
          shortcut.row !== layout.row ||
          shortcut.root !== layout.root ||
          shortcut.share !== layout.share)
      ) {
        removeShortcut(trigger)
        shortcut = undefined
      }
      if (!layout) {
        if (isPostTrigger(trigger)) waiting.add(trigger)
        return
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
        shortcut = { ...layout, button }
        buttons.set(trigger, shortcut)
        buttonTriggers.set(button, trigger)
        const owners = roots.get(layout.root) || new Set()
        owners.add(trigger)
        roots.set(layout.root, owners)
        pin(shortcut)
      } else if (shortcut.code !== layout.code) {
        if (active?.shortcut === shortcut) cancelActive()
        unpin(shortcut)
        shortcut.code = layout.code
        pin(shortcut)
      }
      if (
        shortcut.button.parentElement !== layout.row ||
        shortcut.button.previousElementSibling !== layout.share
      ) {
        layout.share.after(shortcut.button)
      }
      renderState(shortcut)
    }

    /** @param {Node} node */
    function isOwn(node) {
      const element = node instanceof Element ? node : node.parentElement
      return Boolean(element?.closest(OWN_SELECTOR))
    }

    /** @param {Element} node */
    function collect(node) {
      if (isOwn(node)) return
      const found = [
        ...(node.matches(DISCOVERY_SELECTOR) ? [node] : []),
        ...node.querySelectorAll(DISCOVERY_SELECTOR),
      ]
      for (const element of found) {
        if (!(element instanceof HTMLElement) || isOwn(element)) continue
        if (element instanceof HTMLAnchorElement && element.matches(POST_SELECTOR))
          postLinks.add(element)
        if (element instanceof HTMLScriptElement && element.matches(SCRIPT_SELECTOR)) {
          dirtyScripts.add(element)
        } else if (element.matches(MENU_SELECTOR)) {
          menus.add(element)
          menuDirty = true
        } else if (element.matches(TRIGGER_SELECTOR)) {
          dirtyTriggers.add(element)
        }
      }
    }

    /** @param {Element} target */
    function markContext(target) {
      const link = target.closest("a")
      if (link instanceof HTMLAnchorElement) {
        if (link.matches(POST_SELECTOR)) postLinks.add(link)
        else postLinks.delete(link)
      }
      /** @type {Element | null} */
      let parent = target
      for (; parent && parent !== document.body; parent = parent.parentElement) {
        if (parent instanceof HTMLElement) {
          for (const trigger of roots.get(parent) || []) dirtyTriggers.add(trigger)
        }
      }
      const trigger = target.closest(TRIGGER_SELECTOR)
      if (trigger instanceof HTMLElement) dirtyTriggers.add(trigger)
      if (target instanceof HTMLElement && buttons.has(target)) dirtyTriggers.add(target)
      if (target === document.body || target === document.documentElement) return
      if (waiting.size) dirtyContexts.add(target.closest('button, [role="button"]') || target)
    }

    /**
     * @param {MutationRecord} record
     * @param {Element} target
     */
    function shareTextChanged(record, target) {
      if (!target.closest('button, [role="button"]')) return false
      const texts =
        record.type === "characterData"
          ? [record.oldValue, record.target.textContent]
          : [...record.addedNodes, ...record.removedNodes].map((node) => node.textContent)
      return texts.some((text) => SHARE_LABELS.has(normalize(text || "")))
    }

    /** @param {Element} target */
    function affectsMenu(target) {
      if (target.closest(MENU_SELECTOR)) return true
      for (const menu of menus) {
        if (target.contains(menu)) return true
      }
      return false
    }

    function schedule() {
      if (stopped || refreshTimer !== undefined) return
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined
        flush()
      }, 50)
    }

    function routeChanged() {
      if (stopped || currentUrl === location.href) return
      currentUrl = location.href
      generation++
      cancelActive()
      states.clear()
      detached.clear()
      dirtyScripts.clear()
      status.hidden = true
      window.clearTimeout(statusTimer)
      for (const shortcut of buttons.values()) renderState(shortcut)
      fullDiscovery = true
      schedule()
    }

    /**
     * Find a pending trigger without querying the context's descendants.
     * Other triggers or distinct timestamp paths mark a shared context.
     * @param {Element} context
     * @returns {HTMLElement | null | undefined}
     */
    function waitingOwner(context) {
      for (const trigger of buttons.keys()) {
        if (trigger.isConnected && context.contains(trigger) && isPostTrigger(trigger)) return null
      }
      /** @type {HTMLElement | undefined} */
      let owner
      for (const trigger of waiting) {
        if (!trigger.isConnected || !context.contains(trigger) || !isPostTrigger(trigger)) continue
        if (owner) return null
        owner = trigger
      }
      if (!owner) return
      let path
      for (const link of postLinks) {
        if (!link.isConnected || !context.contains(link)) continue
        if (path !== undefined && path !== link.pathname) return null
        path = link.pathname
      }
      return owner
    }

    /** @param {HTMLElement} trigger */
    function waitingBoundary(trigger) {
      /** @type {Element} */
      let boundary = trigger
      for (
        let parent = trigger.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        if (waitingOwner(parent) !== trigger) break
        boundary = parent
      }
      return boundary
    }

    function refreshPosts() {
      for (const [trigger, shortcut] of buttons) {
        if (trigger.isConnected && !shortcut.button.isConnected) dirtyTriggers.add(trigger)
      }
      for (const trigger of waiting.keys()) {
        if (!trigger.isConnected) waiting.delete(trigger)
      }
      for (const link of postLinks) {
        if (!link.isConnected) postLinks.delete(link)
      }
      for (const menu of menus) {
        if (!menu.isConnected || !menu.matches(MENU_SELECTOR)) menus.delete(menu)
      }
      if (fullDiscovery) {
        fullDiscovery = false
        collect(document.documentElement)
      }
      for (const target of dirtyContexts) {
        dirtyContexts.delete(target)
        if (!target.isConnected) continue
        /** @type {Element | null} */
        let context = target
        for (; context && context !== document.body; context = context.parentElement) {
          const owner = waitingOwner(context)
          if (owner === null) break
          if (!owner) continue
          dirtyTriggers.add(owner)
          break
        }
      }
      for (const trigger of dirtyTriggers) {
        dirtyTriggers.delete(trigger)
        // Stop pending recovery before a shared ancestor, including when the
        // timestamp or action row is still incomplete after this mutation.
        const boundary = waiting.has(trigger) ? waitingBoundary(trigger) : undefined
        reconcile(trigger, boundary)
      }
      for (const [trigger, shortcut] of buttons) {
        if (!trigger.isConnected || !shortcut.button.isConnected) removeShortcut(trigger)
      }
    }

    function flush() {
      if (stopped) return
      routeChanged()
      needsPrune = false
      if (!style.isConnected) document.head.append(style)
      if (!status.isConnected) document.body.append(status)
      // Virtualization can recycle several posts in one batch. Pin all incoming
      // codes before any outgoing code can evict their detached state.
      reconciling = true
      try {
        refreshPosts()
      } finally {
        reconciling = false
        trimDetached()
      }
      for (const script of dirtyScripts) {
        dirtyScripts.delete(script)
        if (script.isConnected && script.matches(SCRIPT_SELECTOR)) {
          readSavedScript(script, parsedScripts, setSaved)
        }
      }
      if (menuDirty) {
        menuDirty = false
        syncOpenMenu()
      }
      pendingCheck?.()
    }

    const observer = new MutationObserver((records) => {
      if (stopped) return
      routeChanged()
      let related = false
      for (const record of records) {
        const target =
          record.target instanceof Element ? record.target : record.target.parentElement
        if (!target || isOwn(target)) continue
        const script = target.closest(SCRIPT_SELECTOR)
        if (script instanceof HTMLScriptElement) {
          dirtyScripts.add(script)
          continue
        }
        const inMenu = affectsMenu(target)
        if (inMenu) {
          menuDirty = true
          related = true
        }
        if (record.type === "childList") {
          let structural = false
          for (const node of record.addedNodes) {
            if (!(node instanceof Element) || isOwn(node)) continue
            collect(node)
            if (node === document.body || node === document.head) fullDiscovery = true
            if (node.matches(STRUCTURE_SELECTOR) || node.querySelector(STRUCTURE_SELECTOR)) {
              structural = true
            }
          }
          for (const node of record.removedNodes) {
            if (!(node instanceof Element)) continue
            if (node.matches(`button.${PREFIX}`)) {
              const trigger = buttonTriggers.get(/** @type {HTMLButtonElement} */ (node))
              const shortcut = trigger && buttons.get(trigger)
              if (
                trigger &&
                shortcut &&
                (!node.isConnected ||
                  node.parentElement !== shortcut.row ||
                  node.previousElementSibling !== shortcut.share)
              )
                dirtyTriggers.add(trigger)
            } else if (!isOwn(node)) {
              const removedStructure =
                node.matches(STRUCTURE_SELECTOR) || Boolean(node.querySelector(STRUCTURE_SELECTOR))
              structural ||= removedStructure
              needsPrune ||= removedStructure
              if (node.matches(MENU_SELECTOR) || node.querySelector(MENU_SELECTOR)) {
                menuDirty = true
                related = true
              }
            }
          }
          if (
            structural ||
            target.closest(`${TRIGGER_SELECTOR}, svg`) ||
            shareTextChanged(record, target)
          )
            markContext(target)
        } else if (record.type === "characterData") {
          if (
            !inMenu &&
            (target.closest(`${TRIGGER_SELECTOR}, svg`) || shareTextChanged(record, target))
          )
            markContext(target)
        } else {
          const name = record.attributeName
          if (target.matches(MENU_SELECTOR)) menus.add(/** @type {HTMLElement} */ (target))
          if (name === "aria-expanded" || name === "aria-controls" || name === "id") {
            if (
              target instanceof HTMLElement &&
              name === "aria-expanded" &&
              target.getAttribute(name) !== "true"
            )
              menuCodes.delete(target)
            if (target instanceof HTMLElement && (buttons.has(target) || waiting.has(target))) {
              menuDirty = true
              related = true
            }
          } else if (
            name === "href" ||
            name === "title" ||
            name === "aria-label" ||
            name === "aria-haspopup" ||
            name === "role"
          ) {
            markContext(target)
            if (target.matches(TRIGGER_SELECTOR) && target instanceof HTMLElement)
              dirtyTriggers.add(target)
          }
        }
      }
      if (active && (!active.trigger.isConnected || !active.shortcut.button.isConnected))
        cancelActive()
      if (related || (active && dirtyTriggers.has(active.trigger))) pendingCheck?.()
      if (
        fullDiscovery ||
        needsPrune ||
        dirtyTriggers.size ||
        dirtyContexts.size ||
        dirtyScripts.size ||
        menuDirty
      )
        schedule()
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      characterDataOldValue: true,
      attributeFilter: [
        "aria-haspopup",
        "aria-expanded",
        "aria-controls",
        "aria-label",
        "title",
        "href",
        "role",
        "id",
        "hidden",
        "aria-hidden",
        "inert",
        "aria-disabled",
        "disabled",
        "class",
        "style",
        "type",
      ],
    })

    /** @type {Array<() => void>} */
    const restoreHistory = []
    for (const name of /** @type {const} */ (["pushState", "replaceState"])) {
      const original = history[name]
      /**
       * @this {History}
       * @param {Parameters<History["pushState"]>} args
       */
      function wrapper(...args) {
        const result = Reflect.apply(original, this, args)
        routeChanged()
        return result
      }
      const restore = () => {
        try {
          if (history[name] === wrapper) history[name] = original
        } catch {
          // A page can lock the method later. The retained wrapper is inert after stop.
        }
      }
      restoreHistory.push(restore)
      try {
        history[name] = wrapper
        if (history[name] !== wrapper) throw new Error("History monitoring unavailable.")
      } catch {
        // Do not start a partial instance if navigation cannot be monitored safely.
        stopped = true
        observer.disconnect()
        for (const undo of restoreHistory) undo()
        return () => {}
      }
    }
    window.addEventListener("popstate", routeChanged, { signal: listeners.signal })
    window.addEventListener("hashchange", routeChanged, { signal: listeners.signal })
    document.addEventListener("click", trackClick, { capture: true, signal: listeners.signal })
    flush()

    return () => {
      if (stopped) return
      stopped = true
      generation++
      observer.disconnect()
      listeners.abort()
      cancelActive()
      for (const restore of restoreHistory) restore()
      window.clearTimeout(refreshTimer)
      window.clearTimeout(statusTimer)
      for (const shortcut of buttons.values()) {
        buttonTriggers.delete(shortcut.button)
        shortcut.button.remove()
      }
      buttons.clear()
      roots.clear()
      waiting.clear()
      postLinks.clear()
      live.clear()
      states.clear()
      detached.clear()
      dirtyTriggers.clear()
      dirtyContexts.clear()
      dirtyScripts.clear()
      menus.clear()
      style.remove()
      status.remove()
    }
  }

  return startThreadsSavedButton()
})()
