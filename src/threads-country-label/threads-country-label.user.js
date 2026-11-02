// ==UserScript==
// @name         Threads Country Label
// @namespace    userscripts/threads-country-label
// @version      0.1.0
// @description  Show publicly shared Threads account locations beside post and reply authors.
// @match        https://www.threads.com/*
// @match        https://threads.com/*
// @match        https://www.threads.net/*
// @match        https://threads.net/*
// @downloadURL  https://raw.githubusercontent.com/narumiruna/userscripts/main/src/threads-country-label/threads-country-label.user.js
// @updateURL    https://raw.githubusercontent.com/narumiruna/userscripts/main/src/threads-country-label/threads-country-label.user.js
// @run-at       document-idle
// @grant        none
// @noframes
// @license      AGPL-3.0-only
// ==/UserScript==

// @ts-check

;(() => {
  // biome-ignore lint/suspicious/noRedundantUseStrict: Userscript managers run this as a classic script.
  "use strict"

  const PREFIX = "threads-country-label"
  const UNKNOWN = "所在地未知"
  const TITLE = "Threads 公開的帳號所在地，非國籍"
  const STATE = "THREADS_ABOUT_THIS_PROFILE:about_this_profile_country"
  const REGIONS =
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
      " ",
    )

  /** @typedef {{name: string, code?: string}} Country */
  /** @typedef {{username: string, stamp: HTMLAnchorElement, path: string, host: HTMLElement, label: HTMLSpanElement, visible: boolean}} Binding */
  /** @typedef {{country: Country | undefined, expires: number}} Cached */
  /** @typedef {{viewer: string, token: string, lsd: string, version: string}} Context */
  /** @typedef {{username: string, generation: number, controller: AbortController, timedOut: boolean}} Task */

  /** @param {unknown} value */
  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)
      : undefined
  }

  /** @param {unknown} value */
  function numericID(value) {
    return typeof value === "string" && /^[1-9]\d{0,29}$/.test(value) ? value : undefined
  }

  /** @param {unknown} value */
  function usernameOf(value) {
    return typeof value === "string" && /^[a-z0-9_.]{1,30}$/i.test(value)
      ? value.toLowerCase()
      : undefined
  }

  /**
   * @param {unknown} data
   * @param {(value: unknown) => void} accept
   */
  function visit(data, accept) {
    const pending = [data]
    let count = 0
    while (pending.length && count++ < 100000) {
      const value = pending.pop()
      if (!value || typeof value !== "object") continue
      accept(value)
      for (const child of Object.values(value)) {
        if (child && typeof child === "object") pending.push(child)
      }
    }
  }

  /**
   * @param {Document} root
   * @param {(value: unknown) => void} accept
   * @param {WeakSet<HTMLScriptElement>} [seen]
   */
  function readData(root, accept, seen) {
    for (const script of root.querySelectorAll('script[type="application/json"]')) {
      if (!(script instanceof HTMLScriptElement) || seen?.has(script)) continue
      seen?.add(script)
      const text = script.textContent || ""
      if (text.length > 5000000) continue
      try {
        visit(JSON.parse(text), accept)
      } catch {
        // Invalid or incomplete page data do not establish an identity.
      }
    }
  }

  /** @param {Document} [root] */
  function readContext(root = document) {
    /** @type {Context} */
    const context = { viewer: "", token: "", lsd: "", version: "" }
    readData(root, (value) => {
      if (!Array.isArray(value)) return
      const data = record(value[2])
      if (!data) return
      if (value[0] === "CurrentUserInitialData") {
        context.viewer = numericID(data.NON_FACEBOOK_USER_ID) || "0"
      }
      if (value[0] === "DTSGInitialData" && typeof data.token === "string") {
        context.token = data.token
      }
      if (value[0] === "LSD" && typeof data.token === "string") context.lsd = data.token
      if (value[0] === "WebBloksVersioningID" && typeof data.versioningID === "string") {
        context.version = data.versioningID
      }
    })
    return context
  }

  /** @param {unknown} value */
  function routeIdentity(value) {
    const route = record(record(record(value)?.initialRouteInfo)?.route)
    const params = record(route?.params)
    const props = record(record(route?.rootView)?.props)
    if (
      typeof route?.canonicalRouteName !== "string" ||
      !route.canonicalRouteName.endsWith(".BarcelonaProfileThreadsColumnRoute") ||
      typeof params?.vanity !== "string"
    ) {
      return
    }
    const username = usernameOf(params.vanity.replace(/^@/, ""))
    const id = numericID(props?.user_id)
    if (username && id && route.url === `/@${username}`) return { username, id }
  }

  /** @type {Map<string, Country>} */
  const countries = new Map()
  try {
    const english = new Intl.DisplayNames(["en"], { type: "region" })
    for (const locale of new Set([
      "en",
      "zh-Hant",
      "zh-Hans",
      document.documentElement.lang || "en",
    ])) {
      const names = new Intl.DisplayNames([locale], { type: "region" })
      for (const code of REGIONS) {
        const name = english.of(code)
        const localized = names.of(code)
        if (name && localized) countries.set(localized.toLowerCase(), { name, code })
      }
    }
  } catch {
    // Keep official text readable when Intl.DisplayNames is unavailable.
  }

  /** @param {string} text */
  function countryOf(text) {
    const name = text.trim()
    if (!name || name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(name)) return
    return countries.get(name.toLowerCase()) || { name }
  }

  /** @param {string} text */
  function parseCountry(text) {
    const value = record(JSON.parse(text.replace(/^for \(;;\);/, "")))
    if (value?.error) throw new Error("Native request rejected")
    if (value?.__ar !== 1) return
    const data = record(record(record(value?.payload)?.layout)?.bloks_payload)?.data
    if (!Array.isArray(data)) return
    const states = data
      .filter((item) => record(item)?.type === "gs" && record(item.data)?.mode === "p")
      .map((item) => record(item.data))
    const visibility = states.filter((item) => item?.key === `${STATE}_visibility`)
    const country = states.filter((item) => item?.key === STATE)
    if (visibility.length !== 1 || visibility[0]?.initial !== true || country.length !== 1) return
    const name = country[0]?.initial
    return typeof name === "string" ? countryOf(name) : undefined
  }

  /** @param {HTMLElement} root */
  function isHeader(root) {
    if (root.matches("footer, p, blockquote") || root.querySelector("footer, p, blockquote"))
      return false
    const texts = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = texts.nextNode(); node; node = texts.nextNode()) {
      if (/^[\s·•|›>]*$/u.test(node.textContent || "")) continue
      const owner = node.parentElement?.closest(`a, time, svg, button, [role="button"], .${PREFIX}`)
      if (!owner || !root.contains(owner)) return false
    }
    return true
  }

  /** @param {HTMLAnchorElement} stamp */
  function authorOf(stamp) {
    const url = new URL(stamp.href)
    const post = url.pathname.match(/^\/@([a-z0-9_.]{1,30})\/post\/([^/]+)\/?$/i)
    if (url.origin !== location.origin || !post) return
    const username = post[1]?.toLowerCase()
    if (!username || stamp.closest('nav, aside, [role="navigation"], [role="dialog"]')) return
    for (
      let parent = stamp.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      const stamps = [...parent.querySelectorAll('a[href*="/post/"]:has(time)')]
      if (new Set(stamps.map((link) => link.getAttribute("href"))).size > 1) return
      // Do not cross an action row to treat a body mention as a header author.
      if (
        parent.querySelector(
          '[aria-label="Share"], [title="Share"], [aria-label="分享"], [title="分享"], [aria-label="Like"], [title="Like"], [aria-label="讚"], [title="讚"]',
        )
      ) {
        return
      }
      const links = [...parent.querySelectorAll('a[href*="/@"]')].filter((link) => {
        if (!(link instanceof HTMLAnchorElement) || link.querySelector("img, time")) return false
        const profile = new URL(link.href)
        return (
          profile.origin === location.origin &&
          profile.pathname.toLowerCase() === `/@${username}` &&
          !profile.search &&
          !profile.hash &&
          link.textContent?.trim().toLowerCase() === username &&
          Boolean(link.compareDocumentPosition(stamp) & Node.DOCUMENT_POSITION_FOLLOWING)
        )
      })
      if (links.length > 1) return
      const link = links[0]
      if (link instanceof HTMLAnchorElement) {
        if (!isHeader(parent)) return
        return { link, username, path: url.pathname }
      }
    }
  }

  if (document.getElementById(`${PREFIX}-style`)) return () => {}
  const style = document.createElement("style")
  style.id = `${PREFIX}-style`
  style.textContent = `
    /* Override native atomic-selector specificity only on this script's author and host. */
    .${PREFIX}-host { white-space: normal !important; }
    a.${PREFIX}-author { display: inline-block !important; max-width: 100%; vertical-align: baseline; }
    .${PREFIX} {
      display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: .25em;
      margin-inline-start: .4em; max-width: calc(100% - .4em); vertical-align: baseline;
      font-size: max(.75rem, .8em); font-weight: 400; line-height: 1.5;
      color: inherit; opacity: .8; white-space: normal; overflow-wrap: anywhere;
    }
  `
  document.head.append(style)

  /** @type {Map<HTMLAnchorElement, Binding>} */
  const bindings = new Map()
  /** @type {WeakSet<HTMLElement>} */
  const hosts = new WeakSet()
  /** @type {Map<string, string | null>} */
  const identities = new Map()
  /** @type {Map<string, Cached>} */
  const cache = new Map()
  let seen = new WeakSet()
  let currentURL = location.href
  let viewer = ""
  let generation = 0
  let stopped = false
  let suspended = false
  let lastStart = Number.NEGATIVE_INFINITY
  /** @type {Task | undefined} */
  let active
  /** @type {number | undefined} */
  let refreshTimer
  /** @type {number | undefined} */
  let expiryTimer

  /** @param {string} username @param {string} id */
  function remember(username, id) {
    const previous = identities.get(username)
    if (previous !== undefined && previous !== id) identities.set(username, null)
    else identities.set(username, id)
    if (identities.size > 500) {
      const oldest = identities.keys().next().value
      if (oldest !== undefined) identities.delete(oldest)
    }
  }

  /** @param {HTMLAnchorElement} link @param {Binding} binding */
  function valid(link, binding) {
    if (!link.isConnected || !binding.stamp.isConnected) return false
    const author = authorOf(binding.stamp)
    return (
      author?.link === link && author.username === binding.username && author.path === binding.path
    )
  }

  /** @param {string} username */
  function keyOf(username) {
    return identities.get(username) || `name:${username}`
  }

  /** @param {string} username */
  function cached(username) {
    if (identities.get(username) === null) return
    const key = keyOf(username)
    const value = cache.get(key)
    if (value && value.expires > Date.now()) return value
    cache.delete(key)
  }

  /** @param {Binding} binding */
  function render(binding) {
    const country = cached(binding.username)?.country
    const value = country ? `${country.code || ""}:${country.name}` : "unknown"
    if (binding.label.dataset.value === value) return
    binding.label.dataset.value = value
    binding.label.title = country ? TITLE : "所在地未知：資料尚未取得、未提供或查詢失敗"
    binding.label.setAttribute(
      "aria-label",
      country
        ? `Threads account location: ${country.name}; not nationality or verified current location`
        : "Threads account location unavailable",
    )
    if (!country) {
      binding.label.textContent = UNKNOWN
      return
    }
    const name = document.createElement("span")
    name.textContent = country.name
    binding.label.replaceChildren(name)
    if (country.code) {
      const flag = document.createElement("span")
      flag.setAttribute("aria-hidden", "true")
      flag.textContent = String.fromCodePoint(
        ...[...country.code].map((letter) => 127397 + letter.charCodeAt(0)),
      )
      binding.label.prepend(flag)
    }
  }

  function schedule() {
    if (stopped || refreshTimer !== undefined) return
    refreshTimer = window.setTimeout(() => {
      refreshTimer = undefined
      refresh()
    }, 50)
  }

  /** @param {string} username */
  function visible(username) {
    return [...bindings].some(
      ([link, binding]) => binding.username === username && binding.visible && valid(link, binding),
    )
  }

  const visibility =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          for (const entry of entries) {
            const binding = bindings.get(/** @type {HTMLAnchorElement} */ (entry.target))
            if (binding) binding.visible = entry.isIntersecting
          }
          if (active && !visible(active.username)) active.controller.abort()
          schedule()
        })
      : undefined

  /** @param {Task} task */
  function checkTask(task) {
    if (
      stopped ||
      task.controller.signal.aborted ||
      task.generation !== generation ||
      location.href !== currentURL ||
      readContext().viewer !== viewer ||
      !visible(task.username)
    ) {
      throw new DOMException("Lookup cancelled", "AbortError")
    }
  }

  /** @param {Task} task @param {URL} url @param {RequestInit} [options] */
  async function request(task, url, options = {}) {
    checkTask(task)
    if (url.origin !== location.origin) throw new Error("Cross-origin request refused")
    const delay = Math.max(0, lastStart + 1000 - Date.now())
    if (delay) {
      await new Promise((resolve) => {
        const abort = () => {
          window.clearTimeout(timer)
          resolve(undefined)
        }
        const timer = window.setTimeout(() => {
          task.controller.signal.removeEventListener("abort", abort)
          resolve(undefined)
        }, delay)
        task.controller.signal.addEventListener("abort", abort, { once: true })
      })
    }
    checkTask(task)
    lastStart = Date.now()
    const timeout = window.setTimeout(() => {
      task.timedOut = true
      task.controller.abort()
    }, 10000)
    try {
      const response = await fetch(url, {
        ...options,
        credentials: "same-origin",
        redirect: "manual",
        signal: task.controller.signal,
      })
      checkTask(task)
      if (
        [401, 403, 429].includes(response.status) ||
        (response.status >= 300 && response.status < 400) ||
        response.type === "opaqueredirect"
      ) {
        suspended = true
        throw new Error("Authentication or rate limit")
      }
      if (!response.ok) throw new Error("Lookup failed")
      const text = await response.text()
      checkTask(task)
      return text
    } finally {
      window.clearTimeout(timeout)
    }
  }

  /** @param {Task} task */
  async function lookup(task) {
    let id = identities.get(task.username) || undefined
    /** @type {Country | undefined} */
    let country
    let cancelled = false
    try {
      if (!id) {
        const html = await request(task, new URL(`/@${task.username}`, location.origin))
        const doc = new DOMParser().parseFromString(html, "text/html")
        if (readContext(doc).viewer === "0" || doc.querySelector('input[type="password"]')) {
          suspended = true
          throw new Error("Login challenge")
        }
        const found = new Set()
        readData(doc, (value) => {
          const identity = routeIdentity(value)
          if (identity?.username === task.username) found.add(identity.id)
        })
        const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href")
        if (canonical) {
          const profile = new URL(canonical, location.origin)
          if (profile.origin !== location.origin || profile.pathname !== `/@${task.username}`)
            return
        }
        if (found.size !== 1) return
        id = found.values().next().value
        if (!id) return
        remember(task.username, id)
      }
      checkTask(task)
      if (identities.get(task.username) !== id) return
      const context = readContext()
      if (!context.token || !context.lsd || !context.version) return
      const url = new URL("/async/wbloks/fetch/", location.origin)
      url.search = new URLSearchParams({
        appid: "com.bloks.www.text_post_app.about_this_profile_async_action",
        type: "app",
        __bkv: context.version,
      }).toString()
      const body = new URLSearchParams({
        __a: "1",
        __user: "0",
        fb_dtsg: context.token,
        lsd: context.lsd,
        params: JSON.stringify({
          atpTriggerSessionID: crypto.randomUUID(),
          referer_type: "TextPostAppProfileOverflow",
          target_user_id: id,
        }),
      })
      const text = await request(task, url, { method: "POST", body })
      if (text.trimStart().startsWith("<")) {
        suspended = true
        throw new Error("Login challenge")
      }
      try {
        country = parseCountry(text)
      } catch (error) {
        if (error instanceof Error && error.message === "Native request rejected") suspended = true
        throw error
      }
    } catch (error) {
      cancelled = error instanceof DOMException && error.name === "AbortError" && !task.timedOut
    } finally {
      if (
        !stopped &&
        !cancelled &&
        task.generation === generation &&
        currentURL === location.href &&
        readContext().viewer === viewer &&
        (!id || identities.get(task.username) === id)
      ) {
        cache.set(id || keyOf(task.username), {
          country,
          expires: Date.now() + (country ? 600000 : 60000),
        })
        if (cache.size > 500) {
          const oldest = cache.keys().next().value
          if (oldest !== undefined) cache.delete(oldest)
        }
      }
      if (active === task) active = undefined
      schedule()
    }
  }

  function reset() {
    generation++
    active?.controller.abort()
    active = undefined
    visibility?.disconnect()
    for (const [link, binding] of bindings) {
      link.classList.remove(`${PREFIX}-author`)
      binding.host.classList.remove(`${PREFIX}-host`)
      hosts.delete(binding.host)
      binding.label.remove()
    }
    bindings.clear()
    identities.clear()
    cache.clear()
    seen = new WeakSet()
  }

  function refresh() {
    if (stopped) return
    const context = readContext()
    if (currentURL !== location.href || context.viewer !== viewer) {
      reset()
      currentURL = location.href
      viewer = context.viewer
    }
    readData(
      document,
      (value) => {
        const data = record(value)
        const username = usernameOf(data?.username)
        const id = numericID(data?.pk) || numericID(data?.id)
        if (username && id && (!data?.pk || !data.id || data.pk === data.id)) remember(username, id)
        const identity = routeIdentity(value)
        if (identity) remember(identity.username, identity.id)
      },
      seen,
    )
    /** @type {Map<HTMLAnchorElement, {username: string, stamp: HTMLAnchorElement, path: string}>} */
    const authors = new Map()
    if (!/^\/(search|login|accounts|challenge)(\/|$)/.test(location.pathname)) {
      for (const stamp of document.querySelectorAll('a[href*="/post/"]:has(time)')) {
        if (!(stamp instanceof HTMLAnchorElement)) continue
        const author = authorOf(stamp)
        if (author)
          authors.set(author.link, { username: author.username, stamp, path: author.path })
      }
    }
    for (const [link, binding] of bindings) {
      const author = authors.get(link)
      if (!author || author.username !== binding.username || author.path !== binding.path) {
        visibility?.unobserve(link)
        link.classList.remove(`${PREFIX}-author`)
        binding.host.classList.remove(`${PREFIX}-host`)
        hosts.delete(binding.host)
        binding.label.remove()
        bindings.delete(link)
      }
    }
    window.clearTimeout(expiryTimer)
    let expires = Number.POSITIVE_INFINITY
    for (const [link, author] of authors) {
      const host = link.parentElement
      if (!host) continue
      let binding = bindings.get(link)
      if (!binding) {
        const label = document.createElement("span")
        label.className = PREFIX
        label.setAttribute("role", "note")
        binding = { ...author, host, label, visible: false }
        bindings.set(link, binding)
        visibility?.observe(link)
      }
      binding.stamp = author.stamp
      if (binding.host !== host) {
        binding.host.classList.remove(`${PREFIX}-host`)
        hosts.delete(binding.host)
        binding.host = host
      }
      hosts.add(host)
      if (!host.classList.contains(`${PREFIX}-host`)) host.classList.add(`${PREFIX}-host`)
      if (!link.classList.contains(`${PREFIX}-author`)) link.classList.add(`${PREFIX}-author`)
      if (link.nextSibling !== binding.label) link.after(binding.label)
      render(binding)
      const value = cached(binding.username)
      if (binding.visible && value) expires = Math.min(expires, value.expires)
    }
    if (Number.isFinite(expires)) expiryTimer = window.setTimeout(schedule, expires - Date.now())
    if (active && !visible(active.username)) active.controller.abort()
    if (!active && !suspended && numericID(context.viewer) && visibility) {
      const binding = [...bindings.values()].find(
        (item) => item.visible && identities.get(item.username) !== null && !cached(item.username),
      )
      if (binding) {
        active = {
          username: binding.username,
          generation,
          controller: new AbortController(),
          timedOut: false,
        }
        void lookup(active)
      }
    }
  }

  const observer = new MutationObserver((mutations) => {
    let changed = false
    for (const mutation of mutations) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "class" &&
        !bindings.has(/** @type {HTMLAnchorElement} */ (mutation.target)) &&
        !hosts.has(/** @type {HTMLElement} */ (mutation.target))
      ) {
        continue
      }
      changed = true
      const node =
        mutation.target instanceof HTMLScriptElement
          ? mutation.target
          : mutation.target.parentElement
      if (node instanceof HTMLScriptElement) seen.delete(node)
    }
    if (changed) schedule()
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["href", "type", "class"],
  })
  window.addEventListener("popstate", schedule)
  window.addEventListener("hashchange", schedule)
  const navigationTimer = window.setInterval(() => {
    if (currentURL !== location.href) schedule()
  }, 250)
  refresh()

  return () => {
    if (stopped) return
    stopped = true
    observer.disconnect()
    window.clearInterval(navigationTimer)
    window.clearTimeout(refreshTimer)
    window.clearTimeout(expiryTimer)
    window.removeEventListener("popstate", schedule)
    window.removeEventListener("hashchange", schedule)
    reset()
    style.remove()
  }
})()
