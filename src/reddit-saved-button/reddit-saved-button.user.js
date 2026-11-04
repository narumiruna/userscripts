// ==UserScript==
// @name         Reddit Saved Button
// @namespace    userscripts/reddit-saved-button
// @version      0.1.0
// @description  Add a saved-state bookmark after each Reddit post's Share control.
// @match        https://www.reddit.com/*
// @match        https://reddit.com/*
// @downloadURL  https://raw.githubusercontent.com/narumiruna/userscripts/main/src/reddit-saved-button/reddit-saved-button.user.js
// @updateURL    https://raw.githubusercontent.com/narumiruna/userscripts/main/src/reddit-saved-button/reddit-saved-button.user.js
// @run-at       document-idle
// @grant        none
// @noframes
// @license      AGPL-3.0-only
// ==/UserScript==

// @ts-check

;(() => {
  // biome-ignore lint/suspicious/noRedundantUseStrict: Userscript managers run this as a classic script.
  "use strict"

  const PREFIX = "reddit-saved-button"
  const POST = "shreddit-post"
  const MENU = "shreddit-post-overflow-menu"
  const TRIGGER = 'button[aria-haspopup="menu"], [role="button"][aria-haspopup="menu"]'
  const ROW = '[data-testid="action-row"]'
  const SHARE = 'slot[name="share-button"], shreddit-post-share-button'
  const STRUCTURE = `${MENU}, ${ROW}, ${SHARE}, ${TRIGGER}, slot`
  const VISIBILITY = new Set(["id", "class", "style", "hidden", "aria-hidden", "inert"])
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
  const UNSAVE_LABELS = new Set(["unsave", "remove from saved", "取消儲存", "取消保存", "取消收藏"])

  /** @typedef {{id: string, menu: HTMLElement, trigger: HTMLElement, row: HTMLElement, share: Element}} Layout */
  /** @typedef {Layout & {button: HTMLButtonElement}} Shortcut */

  /** @param {Element} element */
  function parentOf(element) {
    const root = element.getRootNode()
    return (
      element.assignedSlot ||
      element.parentElement ||
      (root instanceof ShadowRoot ? root.host : null)
    )
  }

  /** @param {Element} element */
  function ownerOf(element) {
    for (let parent = element; parent; ) {
      if (parent.matches(POST)) return parent
      const next = parentOf(parent)
      if (!next) return
      parent = next
    }
  }

  /** @param {HTMLElement} element */
  function isVisible(element) {
    for (let parent = /** @type {Element | null} */ (element); parent; parent = parentOf(parent)) {
      if (parent.matches('[hidden], [aria-hidden="true"], [inert]')) return false
      const style = getComputedStyle(parent)
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse"
      ) {
        return false
      }
    }
    return element.getClientRects().length > 0
  }

  /** @param {HTMLElement} element */
  function isDisabled(element) {
    return element.matches(':disabled, [disabled], [aria-disabled="true"]')
  }

  /** @param {Element} element */
  function labelOf(element) {
    const copy = element.cloneNode(true)
    if (!(copy instanceof Element)) return ""
    for (const svg of copy.querySelectorAll("svg")) svg.remove()
    return (element.getAttribute("aria-label") || copy.textContent || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
  }

  /**
   * @param {HTMLElement} post
   * @returns {Layout | undefined}
   */
  function postActions(post) {
    const id = post.id
    if (!/^t3_[a-z0-9]+$/i.test(id)) return
    const menus = [...post.querySelectorAll(MENU)].filter(
      (menu) => ownerOf(menu) === post && menu.getAttribute("post-id") === id,
    )
    if (menus.length !== 1) return
    const menu = menus[0]
    if (!(menu instanceof HTMLElement)) return
    const triggers = [menu, ...(menu.shadowRoot ? [menu.shadowRoot] : [])]
      .flatMap((root) => [...root.querySelectorAll(TRIGGER)])
      .filter((trigger) => trigger instanceof HTMLElement && !trigger.closest('[role="menuitem"]'))
    const trigger = triggers.length === 1 ? triggers[0] : undefined
    if (!(trigger instanceof HTMLElement)) return

    const rows = [post, ...(post.shadowRoot ? [post.shadowRoot] : [])]
      .flatMap((root) => [...root.querySelectorAll(ROW)])
      .filter((row) => row instanceof HTMLElement && ownerOf(row) === post && isVisible(row))
    if (rows.length !== 1) return
    const row = rows[0]
    if (!(row instanceof HTMLElement) || row.contains(trigger)) return
    const shares = [...row.querySelectorAll(SHARE)]
      .filter((share) => ownerOf(share) === post)
      .filter((share) => !share.parentElement?.closest('slot[name="share-button"]'))
    if (shares.length !== 1) return
    let share = shares[0]
    if (!share) return
    const assigned =
      share instanceof HTMLSlotElement ? share.assignedElements({ flatten: true }) : [share]
    const controls = assigned.flatMap((element) =>
      element.matches("shreddit-post-share-button")
        ? [element]
        : [...element.querySelectorAll("shreddit-post-share-button")],
    )
    if (controls.length !== 1) return
    const source = controls[0]?.getAttribute("source-id")
    if (source && source !== id) return
    while (share.parentElement && share.parentElement !== row) share = share.parentElement
    return { id, menu, trigger, row, share }
  }

  /** @param {HTMLElement} menu */
  function saveItem(menu) {
    const roots = [menu, ...(menu.shadowRoot ? [menu.shadowRoot] : [])]
    const items = roots.flatMap((root) => [...root.querySelectorAll('[role="menuitem"]')])
    const candidates = items.length
      ? items
      : roots.flatMap((root) => [...root.querySelectorAll('button, [role="button"]')])
    const matches = candidates.filter(
      (item) =>
        item instanceof HTMLElement &&
        SAVE_LABELS.has(labelOf(item)) &&
        isVisible(item) &&
        !isDisabled(item),
    )
    return matches.length === 1 && matches[0] instanceof HTMLElement ? matches[0] : undefined
  }

  function hasOpenMenu() {
    /** @type {(Document | ShadowRoot)[]} */
    const pending = [document]
    while (pending.length) {
      const root = pending.pop()
      if (!root) continue
      if (root.querySelector('[aria-haspopup="menu"][aria-expanded="true"], rpl-dropdown[open]')) {
        return true
      }
      if (
        [...root.querySelectorAll('[role="menu"]')].some(
          (menu) => menu instanceof HTMLElement && isVisible(menu),
        )
      ) {
        return true
      }
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot) pending.push(element.shadowRoot)
      }
    }
    return false
  }

  /**
   * @param {HTMLElement} post
   * @param {Layout} layout
   * @param {AbortSignal} signal
   * @param {string} url
   * @returns {Promise<HTMLElement>}
   */
  function waitForSaveItem(post, layout, signal, url) {
    return new Promise((resolve, reject) => {
      let opened = false
      // A short poll also handles a menu shadow root created after the click.
      const interval = window.setInterval(check, 50)
      const timeout = window.setTimeout(
        () => finish(new Error("Save action unavailable. Check the native post menu or sign in.")),
        2500,
      )

      /** @param {HTMLElement | Error} result */
      function finish(result) {
        window.clearInterval(interval)
        window.clearTimeout(timeout)
        signal.removeEventListener("abort", cancel)
        if (result instanceof Error) reject(result)
        else resolve(result)
      }

      function cancel() {
        finish(new Error("Save action cancelled."))
      }

      function check() {
        if (
          signal.aborted ||
          location.href !== url ||
          !post.isConnected ||
          !layout.trigger.isConnected ||
          post.id !== layout.id ||
          layout.menu.getAttribute("post-id") !== layout.id
        ) {
          return cancel()
        }
        const expanded = layout.trigger.getAttribute("aria-expanded") === "true"
        if (opened && !expanded) return cancel()
        opened ||= expanded
        if (!expanded) return
        const item = saveItem(layout.menu)
        if (item) finish(item)
      }

      signal.addEventListener("abort", cancel, { once: true })
      check()
    })
  }

  function startRedditSavedButton() {
    if (document.getElementById(`${PREFIX}-style`)) return () => {}

    const style = document.createElement("style")
    style.id = `${PREFIX}-style`
    style.textContent = `
      .${PREFIX} {
        display: inline-flex; align-items: center; justify-content: center;
        flex: 0 0 32px; width: 32px; height: 32px; padding: 6px;
        box-sizing: border-box; align-self: center; border: 0; border-radius: 999px;
        position: relative; background: var(--color-secondary-background, #e5ebee);
        color: var(--color-secondary-content, #333d42); cursor: pointer;
      }
      .${PREFIX}:hover { background: var(--color-secondary-background-hover, #dbe4e9); }
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
    /** @type {WeakMap<HTMLElement, {id: string, flag: string}>} */
    const snapshots = new WeakMap()
    /** @type {WeakMap<HTMLElement, string>} */
    const menuIds = new WeakMap()
    // Keep posts with incomplete layouts so later visibility and definition changes can retry them.
    /** @type {Map<HTMLElement, Map<ShadowRoot, MutationObserver>>} */
    const observers = new Map()
    /** @type {Map<ShadowRoot, HTMLStyleElement>} */
    const styles = new Map()
    /** @type {WeakSet<Node>} */
    const owned = new WeakSet([style, status])
    /** @type {Set<HTMLElement>} */
    const dirtyPosts = new Set()
    let scanAll = true
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
      const saved = states.get(shortcut.id)
      const value = saved === undefined ? "unknown" : String(saved)
      const { button } = shortcut
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
     * @param {string} id
     * @param {boolean} saved
     */
    function setSaved(id, saved) {
      states.set(id, saved)
      for (const shortcut of buttons.values()) {
        if (shortcut.id === id) renderState(shortcut)
      }
    }

    /** @param {Shortcut} shortcut */
    function readSavedState(shortcut) {
      const { id, menu } = shortcut
      const flag = `${menu.hasAttribute("is-logged-in")}:${menu.hasAttribute("is-post-saved")}`
      const previous = snapshots.get(menu)
      if (previous?.id === id && previous.flag === flag) return
      snapshots.set(menu, { id, flag })
      // A recycled menu can still contain the previous post's flags.
      if (previous && previous.id !== id && previous.flag === flag) return
      if (menu.hasAttribute("is-post-saved")) setSaved(id, true)
      else if (menu.hasAttribute("is-logged-in")) setSaved(id, false)
    }

    function openShortcut() {
      const entries = [...buttons].filter(
        ([, shortcut]) =>
          shortcut.trigger.isConnected && shortcut.trigger.getAttribute("aria-expanded") === "true",
      )
      const entry = entries.length === 1 ? entries[0] : undefined
      if (!entry) return
      const [post, shortcut] = entry
      const layout = postActions(post)
      if (
        !layout ||
        layout.id !== shortcut.id ||
        layout.menu !== shortcut.menu ||
        layout.trigger !== shortcut.trigger
      ) {
        return
      }
      const origin = menuIds.get(shortcut.menu)
      if (origin !== undefined && origin !== shortcut.id) return
      menuIds.set(shortcut.menu, shortcut.id)
      return shortcut
    }

    /** @param {Set<HTMLElement>} changed */
    function syncOpenMenu(changed) {
      if (
        active ||
        ![...changed].some(
          (post) => buttons.get(post)?.trigger.getAttribute("aria-expanded") === "true",
        )
      ) {
        return
      }
      const shortcut = openShortcut()
      if (!shortcut) return
      const item = saveItem(shortcut.menu)
      if (item) setSaved(shortcut.id, UNSAVE_LABELS.has(labelOf(item)))
    }

    /** @param {MouseEvent} event */
    function trackNativeAction(event) {
      const path = event.composedPath()
      for (const [post, shortcut] of buttons) {
        if (
          path.includes(shortcut.trigger) &&
          shortcut.trigger.getAttribute("aria-expanded") !== "true"
        ) {
          const layout = postActions(post)
          if (layout) menuIds.set(layout.menu, layout.id)
        }
      }
      if (active) return
      const shortcut = openShortcut()
      if (!shortcut) return
      const item = saveItem(shortcut.menu)
      if (item && path.includes(item)) setSaved(shortcut.id, !UNSAVE_LABELS.has(labelOf(item)))
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
     * @param {HTMLElement} post
     * @param {Shortcut} shortcut
     */
    async function toggle(post, shortcut) {
      if (active || !post.isConnected) return
      const layout = postActions(post)
      if (!layout || isDisabled(layout.trigger) || isDisabled(layout.menu)) return
      if (hasOpenMenu()) {
        report("Close the open menu and try again.")
        return
      }

      Object.assign(shortcut, layout)
      renderState(shortcut)
      const { button } = shortcut
      const controller = new AbortController()
      active = controller
      const cancel = () => controller.abort()
      const url = location.href
      button.disabled = true
      button.setAttribute("aria-busy", "true")
      menuIds.set(layout.menu, layout.id)
      document.addEventListener("pointerdown", cancel, true)
      document.addEventListener("keydown", cancel, true)
      window.addEventListener("popstate", cancel)

      try {
        layout.trigger.click()
        const item = await waitForSaveItem(post, layout, controller.signal, url)
        const current = postActions(post)
        if (
          controller.signal.aborted ||
          location.href !== url ||
          !current ||
          current.id !== layout.id ||
          current.menu !== layout.menu ||
          current.trigger !== layout.trigger ||
          isDisabled(current.trigger) ||
          isDisabled(current.menu) ||
          layout.trigger.getAttribute("aria-expanded") !== "true" ||
          saveItem(layout.menu) !== item
        ) {
          throw new Error("Save action cancelled.")
        }
        const label = labelOf(item)
        item.click()
        setSaved(layout.id, !UNSAVE_LABELS.has(label))
        report(`Reddit action requested: ${label}.`)
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

    function scheduleRefresh() {
      if (stopped || refreshTimer !== undefined) return
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined
        if (!stopped) refresh()
      }, 50)
    }

    function scheduleFullRefresh() {
      if (stopped) return
      scanAll = true
      scheduleRefresh()
    }

    /** @param {Node} node */
    function isOwned(node) {
      for (let current = /** @type {Node | null} */ (node); current; current = current.parentNode) {
        if (owned.has(current)) return true
      }
      return false
    }

    /** @param {Node} node */
    function discover(node) {
      if (node instanceof HTMLElement && node.matches(POST)) {
        dirtyPosts.add(node)
        if (node.shadowRoot) discover(node.shadowRoot)
      }
      if (!(node instanceof Element || node instanceof Document || node instanceof ShadowRoot))
        return
      if (node instanceof Element && !node.firstElementChild) return
      for (const post of node.querySelectorAll(POST)) {
        if (!(post instanceof HTMLElement)) continue
        dirtyPosts.add(post)
        if (post.shadowRoot) discover(post.shadowRoot)
      }
    }

    /** @param {Element} element */
    function nativeMenuOf(element) {
      for (
        let parent = /** @type {Element | null} */ (element);
        parent;
        parent = parentOf(parent)
      ) {
        if (parent.matches(MENU)) return parent
        if (parent.matches(POST)) return
      }
    }

    /** @param {Node} target */
    function invalidateStyles(target) {
      const root = target.getRootNode()
      const post = root instanceof ShadowRoot ? ownerOf(root.host) : undefined
      if (post instanceof HTMLElement) dirtyPosts.add(post)
      else scanAll = true
    }

    /** @param {MutationRecord[]} records */
    function handleMutations(records) {
      if (stopped) return
      // Even an otherwise irrelevant mutation can be the first signal after pushState.
      if (currentUrl !== location.href) scanAll = true
      for (const record of records) {
        if (isOwned(record.target)) continue
        const element =
          record.target instanceof ShadowRoot
            ? record.target.host
            : record.target instanceof Element
              ? record.target
              : record.target.parentElement
        if (!element) continue
        const owner = ownerOf(element)
        const post = owner instanceof HTMLElement ? owner : undefined
        const menu = nativeMenuOf(element)
        const shortcut = post ? buttons.get(post) : undefined
        const open =
          menu === shortcut?.menu && shortcut?.trigger.getAttribute("aria-expanded") === "true"
        if (element.matches('style, link[rel~="stylesheet"]')) {
          invalidateStyles(record.target)
          continue
        }
        if (record.type === "characterData") {
          if (post && open) dirtyPosts.add(post)
          continue
        }
        if (record.type === "attributes") {
          const name = record.attributeName || ""
          if (name === "rel" && record.oldValue?.split(/\s+/).includes("stylesheet")) {
            invalidateStyles(record.target)
          }
          if (VISIBILITY.has(name)) {
            discover(element)
            // Descendant selectors such as :has() can also control row visibility.
            if (post) dirtyPosts.add(post)
          } else if (
            post &&
            ((["post-id", "is-post-saved", "is-logged-in"].includes(name) &&
              element.matches(MENU)) ||
              (name === "source-id" && element.matches("shreddit-post-share-button")) ||
              (name === "data-testid" &&
                (element.getAttribute(name) === "action-row" ||
                  record.oldValue === "action-row")) ||
              (name === "name" && element.matches("slot")) ||
              (name === "slot" &&
                (element.matches(`${POST}, ${ROW}, ${SHARE}`) ||
                  element.querySelector(`${ROW}, shreddit-post-share-button`))) ||
              (menu && ["aria-haspopup", "aria-expanded", "open", "role"].includes(name)) ||
              (open && ["aria-label", "disabled", "aria-disabled"].includes(name)))
          ) {
            dirtyPosts.add(post)
          }
          continue
        }
        if (post && open) dirtyPosts.add(post)
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (isOwned(node)) {
            const root = record.target.getRootNode()
            if (
              post &&
              !node.isConnected &&
              (node === shortcut?.button ||
                (root instanceof ShadowRoot && node === styles.get(root)))
            ) {
              dirtyPosts.add(post)
            }
            continue
          }
          if (!(node instanceof Element)) continue
          discover(node)
          if (
            node.matches('style, link[rel~="stylesheet"]') ||
            node.querySelector('style, link[rel~="stylesheet"]')
          ) {
            invalidateStyles(record.target)
          }
          if (
            post &&
            !node.matches(POST) &&
            (node.matches(STRUCTURE) || node.querySelector(STRUCTURE))
          ) {
            dirtyPosts.add(post)
          }
        }
        if (
          post &&
          shortcut &&
          record.target === shortcut.row &&
          (shortcut.button.parentElement !== shortcut.row ||
            shortcut.button.previousElementSibling !== shortcut.share)
        ) {
          dirtyPosts.add(post)
        }
      }
      if (scanAll || dirtyPosts.size) scheduleRefresh()
    }

    const options = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      attributeFilter: [
        "id",
        "data-testid",
        "name",
        "class",
        "style",
        "post-id",
        "source-id",
        "slot",
        "is-post-saved",
        "is-logged-in",
        "aria-haspopup",
        "aria-expanded",
        "aria-label",
        "aria-disabled",
        "aria-hidden",
        "hidden",
        "inert",
        "disabled",
        "open",
        "role",
        "href",
        "rel",
        "media",
      ],
    }

    /** @param {HTMLElement} post */
    function reconcile(post) {
      let watched = observers.get(post)
      const connected = post.isConnected
      /** @type {Set<ShadowRoot>} */
      const roots = new Set()
      if (connected) {
        if (!watched) {
          watched = new Map()
          observers.set(post, watched)
        }
        if (post.shadowRoot) roots.add(post.shadowRoot)
        for (const menu of post.querySelectorAll(MENU)) {
          if (ownerOf(menu) === post && menu.shadowRoot) roots.add(menu.shadowRoot)
        }
      }
      for (const [root, observer] of watched || []) {
        if (roots.has(root)) continue
        observer.disconnect()
        watched?.delete(root)
        styles.get(root)?.remove()
        styles.delete(root)
      }
      for (const root of roots) {
        if (watched?.has(root)) continue
        const observer = new MutationObserver(handleMutations)
        observer.observe(root, options)
        watched?.set(root, observer)
      }
      const layout = connected ? postActions(post) : undefined
      let shortcut = buttons.get(post)
      if (!layout) {
        shortcut?.button.remove()
        buttons.delete(post)
        if (!connected) observers.delete(post)
        return
      }
      if (!shortcut) {
        const button = document.createElement("button")
        owned.add(button)
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
        const created = { button, ...layout }
        button.addEventListener("click", (event) => {
          event.preventDefault()
          event.stopPropagation()
          void toggle(post, created)
        })
        shortcut = created
        buttons.set(post, shortcut)
      }
      Object.assign(shortcut, layout)
      if (
        shortcut.button.parentElement !== layout.row ||
        shortcut.button.previousElementSibling !== layout.share
      ) {
        layout.share.after(shortcut.button)
      }
      const root = shortcut.button.getRootNode()
      if (root instanceof ShadowRoot && !styles.get(root)?.isConnected) {
        const copy = document.createElement("style")
        owned.add(copy)
        copy.id = style.id
        copy.textContent = style.textContent
        root.append(copy)
        styles.set(root, copy)
      }
      readSavedState(shortcut)
      renderState(shortcut)
    }

    function refresh() {
      if (currentUrl !== location.href) {
        currentUrl = location.href
        active?.abort()
        states.clear()
        scanAll = true
      }
      if (scanAll) {
        for (const post of observers.keys()) dirtyPosts.add(post)
        discover(document)
        scanAll = false
      }
      const changed = new Set(dirtyPosts)
      dirtyPosts.clear()
      for (const post of changed) reconcile(post)
      syncOpenMenu(changed)
      if (dirtyPosts.size) scheduleRefresh()
    }

    document.addEventListener("click", trackNativeAction, true)
    window.addEventListener("popstate", scheduleFullRefresh)
    window.addEventListener("hashchange", scheduleFullRefresh)
    window.addEventListener("afterRoute", scheduleFullRefresh)
    window.addEventListener("resize", scheduleFullRefresh)
    const observer = new MutationObserver(handleMutations)
    observer.observe(document.documentElement, options)
    for (const tag of [POST, MENU]) {
      void customElements.whenDefined(tag).then(scheduleFullRefresh)
    }
    refresh()

    return () => {
      stopped = true
      observer.disconnect()
      for (const watched of observers.values()) {
        for (const observer of watched.values()) observer.disconnect()
      }
      observers.clear()
      dirtyPosts.clear()
      active?.abort()
      window.clearTimeout(refreshTimer)
      window.clearTimeout(statusTimer)
      document.removeEventListener("click", trackNativeAction, true)
      window.removeEventListener("popstate", scheduleFullRefresh)
      window.removeEventListener("hashchange", scheduleFullRefresh)
      window.removeEventListener("afterRoute", scheduleFullRefresh)
      window.removeEventListener("resize", scheduleFullRefresh)
      for (const shortcut of buttons.values()) shortcut.button.remove()
      for (const copy of styles.values()) copy.remove()
      buttons.clear()
      styles.clear()
      states.clear()
      style.remove()
      status.remove()
    }
  }

  return startRedditSavedButton()
})()
