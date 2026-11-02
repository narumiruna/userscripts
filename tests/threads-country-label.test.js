// @vitest-environment jsdom
import { Script } from "node:vm"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import source from "../src/threads-country-label/threads-country-label.user.js?raw"
import savedSource from "../src/threads-saved-button/threads-saved-button.user.js?raw"
import fixture from "./fixtures/threads-country-label.json"

const script = new Script(source)
const savedScript = new Script(savedSource)
const LABEL = ".threads-country-label"
const STYLE = "threads-country-label-style"
const UNKNOWN = "所在地未知"
const TOOLTIP = "Threads 公開的帳號所在地，非國籍"
const INSTALL_URL =
  "https://raw.githubusercontent.com/narumiruna/userscripts/main/src/threads-country-label/threads-country-label.user.js"
let stop
let stopSaved
let observers
let fetchMock
let respond
let starts
let contextData

function jsonData(value) {
  const node = document.createElement("script")
  node.type = "application/json"
  node.textContent = JSON.stringify(value)
  document.head.append(node)
  return node
}

function modules(viewer = "900001") {
  return {
    define: [
      ["CurrentUserInitialData", [], { NON_FACEBOOK_USER_ID: viewer }],
      ["DTSGInitialData", [], { token: "test-only-csrf" }],
      ["LSD", [], { token: "test-only-lsd" }],
      ["WebBloksVersioningID", [], { versioningID: "test-only-version" }],
    ],
  }
}

function addPost(username = "example", code = "first") {
  const post = document.createElement("section")
  post.innerHTML = `
    <div class="author-header">
      <a class="author" href="/@${username}">${username}</a>
      <a class="timestamp" href="/@${username}/post/${code}"><time>now</time></a>
      <div role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false">
        <svg title="More"><title>More</title></svg>
      </div>
    </div>
    <div class="body">Post body</div>
    <div class="post-actions">
      <div><button type="button"><svg title="Like"></svg></button></div>
      <div><button type="button"><svg title="Comment"></svg></button></div>
      <div><button type="button"><svg title="Repost"></svg></button></div>
      <div class="share-action"><button type="button"><svg title="Share"></svg></button></div>
    </div>`
  document.body.append(post)
  return post
}

function author(post) {
  return post.querySelector(".author")
}

function label(post) {
  const value = post.querySelector(LABEL)
  expect(value).toBeInstanceOf(HTMLSpanElement)
  return value
}

function setAuthor(post, username, code = "reused") {
  author(post).href = `/@${username}`
  author(post).textContent = username
  post.querySelector(".timestamp").href = `/@${username}/post/${code}`
}

function response(value = fixture.english, status = 200, extra = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    type: "basic",
    headers: new Headers(),
    text: vi.fn(async () =>
      typeof value === "string" ? value : `for (;;);${JSON.stringify(value)}`,
    ),
    ...extra,
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function pendingRequest() {
  const pending = deferred()
  respond.mockImplementationOnce((_url, options) => {
    options.signal.addEventListener(
      "abort",
      () => pending.reject(new DOMException("Aborted", "AbortError")),
      { once: true },
    )
    return pending.promise
  })
  return pending
}

function countryVariant(change) {
  const data = structuredClone(fixture.english)
  change(data.payload.layout.bloks_payload.data)
  return data
}

function profileHTML(data = fixture.profile, canonical = "/@example") {
  return `<html><head><link rel="canonical" href="${location.origin}${canonical}"></head>
    <body><script type="application/json">${JSON.stringify(data)}</script></body></html>`
}

function start() {
  stop = script.runInThisContext()
  expect(stop).toBeTypeOf("function")
}

function intersect(posts, isIntersecting = true) {
  const observer = observers.at(-1)
  const links = posts.map(author)
  for (const target of links) expect(observer.targets.has(target)).toBe(true)
  observer.callback(
    links.map((target) => ({ target, isIntersecting })),
    observer,
  )
}

async function tick(ms = 120) {
  await vi.advanceTimersByTimeAsync(ms)
}

async function reveal(...posts) {
  intersect(posts)
  await tick()
}

function expectUnknown(post) {
  expect(label(post).textContent).toBe(UNKNOWN)
  expect(label(post).querySelector('[aria-hidden="true"]')).toBeNull()
  expect(label(post).getAttribute("aria-label")).toMatch(/account location.*unavailable/i)
}

function expectCountry(post, name = "United States", flag = "🇺🇸") {
  const value = label(post)
  expect(value.title).toBe(TOOLTIP)
  expect(value.getAttribute("aria-label")).toContain(`account location: ${name}`)
  expect(value.getAttribute("aria-label")).toMatch(/not nationality/i)
  expect([...value.children].some((node) => node.textContent === name)).toBe(true)
  const decorative = value.querySelector('[aria-hidden="true"]')
  if (flag) expect(decorative?.textContent).toBe(flag)
  else expect(decorative).toBeNull()
  expect(value.querySelector("img, svg, a, button")).toBeNull()
}

function expectSpaced() {
  for (let index = 1; index < starts.length; index++) {
    expect(starts[index].at - starts[index - 1].at).toBeGreaterThanOrEqual(1000)
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-02T00:00:00Z"))
  document.head.innerHTML = ""
  document.body.innerHTML = ""
  document.documentElement.lang = "en"
  history.replaceState(null, "", "/")
  stop = () => {}
  stopSaved = () => {}
  observers = []
  starts = []
  contextData = jsonData(modules())
  jsonData({ posts: fixture.posts })
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      targets = new Set()
      constructor(callback) {
        this.callback = callback
        observers.push(this)
      }
      observe = vi.fn((target) => this.targets.add(target))
      unobserve = vi.fn((target) => this.targets.delete(target))
      disconnect = vi.fn(() => this.targets.clear())
    },
  )
  respond = vi.fn(async () => response())
  fetchMock = vi.fn((url, options = {}) => {
    starts.push({ url: new URL(url), options, at: Date.now() })
    return respond(url, options)
  })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(async () => {
  stop()
  stopSaved()
  await tick(0)
  expect(vi.getTimerCount()).toBe(0)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

test("has installable metadata and exact source installation URLs", () => {
  const header = source.match(/^\/\/ ==UserScript==\n[\s\S]*?\/\/ ==\/UserScript==/)
  expect(header).not.toBeNull()
  for (const [key, value] of [
    ["name", "Threads Country Label"],
    ["version", "0.1.0"],
    ["grant", "none"],
    ["run-at", "document-idle"],
    ["license", "AGPL-3.0-only"],
    ["downloadURL", INSTALL_URL],
    ["updateURL", INSTALL_URL],
  ]) {
    expect(header[0].match(new RegExp(`^// @${key}\\s+(.+)$`, "m"))?.[1]).toBe(value)
  }
  expect(header[0]).toMatch(/^\/\/ @noframes$/m)
  expect([...header[0].matchAll(/^\/\/ @match\s+(.+)$/gm)].map((match) => match[1])).toEqual([
    "https://www.threads.com/*",
    "https://threads.com/*",
    "https://www.threads.net/*",
    "https://threads.net/*",
  ])
  expect(header[0]).not.toMatch(/^\/\/ @(require|resource|connect)\b/m)
})

test("executes the exact plain JavaScript without imports or a global API", () => {
  expect(() => new Script(source)).not.toThrow()
  expect(source).not.toMatch(/^\s*(import|export)\s/m)
  expect(source).not.toMatch(/\brequire\s*\(/)
  const globals = new Set(Reflect.ownKeys(globalThis))
  const windowGlobals = new Set(Reflect.ownKeys(window))
  start()
  stop()
  expect(Reflect.ownKeys(globalThis).filter((key) => !globals.has(key))).toEqual([])
  expect(Reflect.ownKeys(window).filter((key) => !windowGlobals.has(key))).toEqual([])
})

test.each([
  ["English", fixture.english],
  ["observed Traditional Chinese", fixture.traditionalChinese],
])(
  "normalizes the %s response with visible English text and an accessible location",
  async (_name, data) => {
    respond.mockResolvedValue(response(data))
    const post = addPost()
    const link = author(post)
    const href = link.getAttribute("href")
    const text = link.textContent
    const clicked = vi.fn((event) => event.preventDefault())
    link.addEventListener("click", clicked)
    start()
    expectUnknown(post)
    await reveal(post)
    expectCountry(post)
    expect(link.getAttribute("href")).toBe(href)
    expect(link.textContent).toBe(text)
    link.click()
    expect(clicked).toHaveBeenCalledOnce()
    expect(link.nextSibling).toBe(label(post))
    expect(link.contains(label(post))).toBe(false)
    expect(label(post).getAttribute("role")).toBe("note")
    expect(document.querySelectorAll(LABEL)).toHaveLength(1)
  },
)

test("uses only the verified native same-origin request and invented page credentials", async () => {
  const post = addPost()
  start()
  await reveal(post)
  expect(fetchMock).toHaveBeenCalledOnce()
  const { url, options } = starts[0]
  expect(url.origin).toBe(location.origin)
  expect(url.pathname).toBe(fixture.observation.endpoint)
  expect(url.searchParams.get("appid")).toBe(fixture.observation.app)
  expect(url.searchParams.get("__bkv")).toBe("test-only-version")
  expect(options.method).toBe("POST")
  expect(options.credentials).toBe("same-origin")
  expect(options.redirect).toBe("manual")
  const body = new URLSearchParams(options.body)
  expect(JSON.parse(body.get("params")).target_user_id).toBe(fixture.posts[0].user.pk)
  expect(body.get("fb_dtsg")).toBe("test-only-csrf")
  expect(body.get("lsd")).toBe("test-only-lsd")
  expect(options.signal).toBeInstanceOf(AbortSignal)
})

test.each(["Example Region", '<img src=x onerror="alert(1)">'])(
  "renders the unmapped official value %s as text without an invented flag",
  async (name) => {
    respond.mockResolvedValue(
      response(
        countryVariant((states) => {
          states[1].data.initial = name
        }),
      ),
    )
    const post = addPost()
    start()
    await reveal(post)
    expectCountry(post, name, null)
    expect(label(post).textContent).toBe(name)
    expect(label(post).querySelector("img")).toBeNull()
  },
)

const invalidCountries = [
  ["unavailable fixture", fixture.unavailable],
  [
    "false visibility",
    countryVariant((states) => {
      states[0].data.initial = false
    }),
  ],
  [
    "missing visibility",
    countryVariant((states) => {
      states.splice(0, 1)
    }),
  ],
  [
    "string visibility",
    countryVariant((states) => {
      states[0].data.initial = "true"
    }),
  ],
  [
    "numeric visibility",
    countryVariant((states) => {
      states[0].data.initial = 1
    }),
  ],
  [
    "null visibility",
    countryVariant((states) => {
      states[0].data.initial = null
    }),
  ],
  [
    "duplicate visibility",
    countryVariant((states) => {
      states.push(structuredClone(states[0]))
    }),
  ],
  [
    "missing country",
    countryVariant((states) => {
      states.pop()
    }),
  ],
  [
    "duplicate country",
    countryVariant((states) => {
      states.push(structuredClone(states[1]))
    }),
  ],
  [
    "null country",
    countryVariant((states) => {
      states[1].data.initial = null
    }),
  ],
  [
    "object country",
    countryVariant((states) => {
      states[1].data.initial = { name: "United States" }
    }),
  ],
  [
    "boolean country",
    countryVariant((states) => {
      states[1].data.initial = true
    }),
  ],
  [
    "empty country",
    countryVariant((states) => {
      states[1].data.initial = "   "
    }),
  ],
  [
    "control characters",
    countryVariant((states) => {
      states[1].data.initial = "United\u0000States"
    }),
  ],
  [
    "excessive country length",
    countryVariant((states) => {
      states[1].data.initial = "x".repeat(121)
    }),
  ],
  [
    "wrong state type",
    countryVariant((states) => {
      states[1].type = "not-gs"
    }),
  ],
  ["missing payload", {}],
  ["malformed data", { payload: { layout: { bloks_payload: { data: {} } } } }],
  ["malformed JSON", "for (;;);{"],
  ["JSON null", "for (;;);null"],
]

test.each(invalidCountries)(
  "keeps %s unknown without claiming that the author hid it",
  async (_name, data) => {
    respond.mockResolvedValue(response(data))
    const post = addPost()
    start()
    await reveal(post)
    expectUnknown(post)
    expect(label(post).title).not.toMatch(/hidden|隱藏/i)
    expect(fetchMock).toHaveBeenCalledOnce()
  },
)

test("never infers a country from biography, display name, caption, or reporting configuration", async () => {
  jsonData({
    posts: [
      {
        user: {
          ...fixture.posts[0].user,
          biography: "🇺🇸 United States",
          full_name: "United States",
        },
        caption: "Taiwan 🇹🇼",
      },
    ],
    BarcelonaReportingConfig: { country_name: "United States" },
    unrelated: { country_name: "美國", country_code: "US" },
  })
  respond.mockResolvedValue(response(fixture.unavailable))
  const post = addPost()
  start()
  expectUnknown(post)
  await reveal(post)
  expectUnknown(post)
})

test("shows unknown while a lookup is loading and after a network error", async () => {
  const pending = pendingRequest()
  const post = addPost()
  start()
  await reveal(post)
  expectUnknown(post)
  pending.reject(new TypeError("Network unavailable"))
  await tick()
  expectUnknown(post)
  expect(label(post).querySelector('[role="status"], [role="progressbar"]')).toBeNull()
})

test("does not fetch until an author intersects and cancels when it becomes invisible", async () => {
  const pending = pendingRequest()
  const post = addPost()
  start()
  await tick(5000)
  expect(fetchMock).not.toHaveBeenCalled()
  expectUnknown(post)
  await reveal(post)
  expect(fetchMock).toHaveBeenCalledOnce()
  intersect([post], false)
  await tick()
  expect(starts[0].options.signal.aborted).toBe(true)
  pending.resolve(response())
  await tick()
  expectUnknown(post)
  expect(fetchMock).toHaveBeenCalledOnce()
})

test("retries a visibility-cancelled lookup without treating it as a cached failure", async () => {
  pendingRequest()
  const post = addPost()
  start()
  await reveal(post)
  intersect([post], false)
  await tick()
  await reveal(post)
  await tick(1100)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expectCountry(post)
  expectSpaced()
})

test("fails safely without IntersectionObserver and never guesses visibility", async () => {
  vi.stubGlobal("IntersectionObserver", undefined)
  const post = addPost()
  start()
  await tick(15000)
  expectUnknown(post)
  expect(fetchMock).not.toHaveBeenCalled()
})

test("serializes authors with at least 1000 ms between request starts", async () => {
  const pending = pendingRequest()
  const first = addPost()
  const second = addPost("another", "second")
  start()
  await reveal(first, second)
  await tick(2500)
  expect(fetchMock).toHaveBeenCalledOnce()
  pending.resolve(response())
  await tick()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expectSpaced()
  expectCountry(first)
  expectCountry(second)
})

test("does not start the next known-author fetch before the one-second boundary", async () => {
  const first = addPost()
  const second = addPost("another", "second")
  start()
  await reveal(first, second)
  const firstStart = starts[0].at
  await tick(firstStart + 999 - Date.now())
  expect(fetchMock).toHaveBeenCalledOnce()
  await tick(1)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  await tick()
  expectCountry(first)
  expectCountry(second)
  expectSpaced()
})

test("deduplicates active, queued, and cached copies by stable account identity", async () => {
  const pending = pendingRequest()
  const first = addPost()
  const duplicate = addPost("example", "copy")
  start()
  await reveal(first, duplicate)
  const later = addPost("example", "later")
  await tick()
  await reveal(later)
  expect(fetchMock).toHaveBeenCalledOnce()
  pending.resolve(response())
  await tick()
  for (const post of [first, duplicate, later]) expectCountry(post)
  const cachedCopy = addPost("example", "cached")
  await tick()
  await reveal(cachedCopy)
  expectCountry(cachedCopy)
  expect(fetchMock).toHaveBeenCalledOnce()
})

test("deduplicates two usernames that have the same explicit account ID", async () => {
  jsonData({ user: { username: "alias", pk: "1001", id: "1001" } })
  const first = addPost()
  const alias = addPost("alias", "alias-post")
  start()
  await reveal(first, alias)
  await tick(1100)
  expectCountry(first)
  expectCountry(alias)
  expect(fetchMock).toHaveBeenCalledOnce()
})

test("uses the observed profile route fallback with spacing before the native POST", async () => {
  const post = addPost("fallback", "fallback-post")
  const profile = structuredClone(fixture.profile)
  profile.initialRouteInfo.route.url = "/@fallback"
  profile.initialRouteInfo.route.params.vanity = "@fallback"
  profile.initialRouteInfo.route.rootView.props.user_id = "2001"
  respond
    .mockResolvedValueOnce(response(profileHTML(profile, "/@fallback")))
    .mockResolvedValueOnce(response())
  start()
  await reveal(post)
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(starts[0].url.href).toBe(`${location.origin}/@fallback`)
  expect(starts[0].options.method ?? "GET").toBe("GET")
  expectUnknown(post)
  await tick(1100)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(JSON.parse(new URLSearchParams(starts[1].options.body).get("params")).target_user_id).toBe(
    "2001",
  )
  expectSpaced()
  expectCountry(post)
})

test.each(["vanity", "route URL", "route name", "canonical", "ID", "ambiguous IDs"])(
  "rejects a fetched profile with a mismatched %s",
  async (mismatch) => {
    const post = addPost("fallback", "fallback-post")
    const profile = structuredClone(fixture.profile)
    const route = profile.initialRouteInfo.route
    route.url = "/@fallback"
    route.params.vanity = "@fallback"
    let canonical = "/@fallback"
    if (mismatch === "vanity") route.params.vanity = "@another"
    if (mismatch === "route URL") route.url = "/@another"
    if (mismatch === "route name") route.canonicalRouteName = "UnverifiedProfileRoute"
    if (mismatch === "canonical") canonical = "/@another"
    if (mismatch === "ID") route.rootView.props.user_id = "not-an-id"
    const data =
      mismatch === "ambiguous IDs"
        ? [
            profile,
            { initialRouteInfo: { route: { ...route, rootView: { props: { user_id: "9999" } } } } },
          ]
        : profile
    respond.mockResolvedValue(response(profileHTML(data, canonical)))
    start()
    await reveal(post)
    await tick(2000)
    expectUnknown(post)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(starts[0].url.pathname).toBe("/@fallback")
  },
)

test.each(["password form", "logged-out module"])(
  "suspends profile fallback requests after a %s challenge",
  async (challenge) => {
    const first = addPost("fallback", "fallback-post")
    const second = addPost("another", "second")
    const html =
      challenge === "password form"
        ? '<html><body><form><input type="password"></form></body></html>'
        : profileHTML({ ...fixture.profile, ...modules("0") }, "/@fallback")
    respond.mockResolvedValueOnce(response(html))
    start()
    await reveal(first, second)
    await tick(61000)
    expectUnknown(first)
    expectUnknown(second)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(starts[0].url.pathname).toBe("/@fallback")
  },
)

test("does not bind a fetched profile by an unrelated nested user or a display name", async () => {
  const post = addPost("fallback", "fallback-post")
  respond.mockResolvedValue(
    response(
      profileHTML(
        { user: { username: "fallback", pk: "2001", full_name: "fallback" } },
        "/@fallback",
      ),
    ),
  )
  start()
  await reveal(post)
  await tick(2000)
  expectUnknown(post)
  expect(fetchMock).toHaveBeenCalledOnce()
})

test.each(["negative", "network failure"])(
  "caches a %s for 60 seconds before retrying",
  async (kind) => {
    if (kind === "negative") respond.mockResolvedValueOnce(response(fixture.unavailable))
    else respond.mockRejectedValueOnce(new TypeError("Offline"))
    const post = addPost()
    start()
    await reveal(post)
    expectUnknown(post)
    const firstStart = starts[0].at
    await tick(firstStart + 59999 - Date.now())
    document.body.append(document.createElement("div"))
    await tick(0)
    expect(fetchMock).toHaveBeenCalledOnce()
    await tick(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(starts[1].at - firstStart).toBeGreaterThanOrEqual(60000)
    expectCountry(post)
  },
)

test("does not fetch another author during the ten-second request-body timeout", async () => {
  const body = deferred()
  respond.mockResolvedValueOnce(response(undefined, 200, { text: () => body.promise }))
  const first = addPost()
  const second = addPost("another", "second")
  start()
  await reveal(first, second)
  await tick(5000)
  expect(fetchMock).toHaveBeenCalledOnce()
  expectUnknown(first)
  body.resolve(`for (;;);${JSON.stringify(fixture.english)}`)
  await tick()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expectCountry(first)
  expectCountry(second)
  expectSpaced()
})

test("expires a positive result after ten minutes and updates all visible copies", async () => {
  const first = addPost()
  const copy = addPost("example", "copy")
  start()
  await reveal(first, copy)
  const firstStart = starts[0].at
  await tick(firstStart + 599999 - Date.now())
  expect(fetchMock).toHaveBeenCalledOnce()
  expectCountry(first)
  respond.mockResolvedValue(response(fixture.unavailable))
  await tick(200)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(starts[1].at - firstStart).toBeGreaterThanOrEqual(600000)
  expectUnknown(first)
  expectUnknown(copy)
})

test("evicts the oldest result at 500 cache entries without evicting recent results", async () => {
  // Keep one DOM row and one changing identity record. Each of 501 targeted
  // requests advances only one second, so no positive entry reaches its TTL.
  const identity = jsonData({ user: { username: "cache0", pk: "10000", id: "10000" } })
  const post = addPost("cache0", "cache-post")
  start()
  await reveal(post)
  const firstStart = starts[0].at
  for (let index = 1; index <= 500; index++) {
    const username = `cache${index}`
    const id = String(10000 + index)
    identity.textContent = JSON.stringify({ user: { username, pk: id, id } })
    setAuthor(post, username)
    await tick(60)
    intersect([post])
    await tick(1000)
  }
  expect(fetchMock).toHaveBeenCalledTimes(501)
  expect(Date.now() - firstStart).toBeLessThan(600000)
  expectCountry(post)
  const recent = addPost("cache500", "recent-copy")
  await tick(60)
  await reveal(recent)
  expectCountry(recent)
  expect(fetchMock).toHaveBeenCalledTimes(501)
  identity.textContent = JSON.stringify({ user: { username: "cache0", pk: "10000", id: "10000" } })
  setAuthor(post, "cache0")
  await tick(60)
  await reveal(post)
  await tick(1000)
  expect(fetchMock).toHaveBeenCalledTimes(502)
  expect(
    JSON.parse(new URLSearchParams(starts.at(-1).options.body).get("params")).target_user_id,
  ).toBe("10000")
  expectCountry(post)
  expectSpaced()
}, 30000)

test("aborts a request after ten seconds and applies the negative retry delay", async () => {
  pendingRequest()
  const post = addPost()
  start()
  await reveal(post)
  const firstStart = starts[0].at
  await tick(firstStart + 9999 - Date.now())
  expect(starts[0].options.signal.aborted).toBe(false)
  await tick(1)
  expect(starts[0].options.signal.aborted).toBe(true)
  await tick(120)
  expectUnknown(post)
  await tick(59000)
  expect(fetchMock).toHaveBeenCalledOnce()
  await tick(1000)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(starts[1].at - firstStart).toBeGreaterThanOrEqual(70000)
  expectCountry(post)
})

test.each([
  ["401", () => response({}, 401)],
  ["403", () => response({}, 403)],
  ["429", () => response({}, 429)],
  ["native error", () => response({ error: 1357004, errorSummary: "Login required" })],
  ["HTML login challenge", () => response("<!doctype html><html><form>Log in</form></html>")],
  ["opaque redirect", () => response("", 0, { type: "opaqueredirect" })],
  ["login redirect", () => response("", 302, { headers: new Headers({ Location: "/login" }) })],
])("suspends all page-session lookups after %s", async (_name, makeResponse) => {
  respond.mockResolvedValueOnce(makeResponse())
  const first = addPost()
  const second = addPost("another", "second")
  start()
  await reveal(first, second)
  await tick(61000)
  expectUnknown(first)
  expectUnknown(second)
  expect(fetchMock).toHaveBeenCalledOnce()
  // Navigation must not bypass a page-session suspension.
  history.pushState(null, "", "/@example/post/first")
  await tick(300)
  await reveal(first, second)
  await tick(1000)
  expect(fetchMock).toHaveBeenCalledOnce()
})

test("does not suspend other authors for a normal server failure", async () => {
  respond.mockResolvedValueOnce(response({}, 500))
  const first = addPost()
  const second = addPost("another", "second")
  start()
  await reveal(first, second)
  await tick(1100)
  expectUnknown(first)
  expectCountry(second)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expectSpaced()
})

test("never opens native menus, writes account state, persists data, or patches fetch", async () => {
  const post = addPost()
  const click = vi.fn()
  post.addEventListener("click", click)
  const storage = vi.spyOn(Storage.prototype, "setItem")
  const database = vi.fn()
  vi.stubGlobal("indexedDB", { open: database })
  const cookie = vi.spyOn(Document.prototype, "cookie", "set")
  start()
  await reveal(post)
  await tick(1100)
  expect(click).not.toHaveBeenCalled()
  expect(storage).not.toHaveBeenCalled()
  expect(database).not.toHaveBeenCalled()
  expect(cookie).not.toHaveBeenCalled()
  expect(globalThis.fetch).toBe(fetchMock)
  expect(window.fetch).toBe(fetchMock)
  expect(document.querySelector('[role="menu"], [role="dialog"]')).toBeNull()
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(starts[0].url.pathname).toBe(fixture.observation.endpoint)
})

test("handles added posts, replaced author links, and removed author rows", async () => {
  start()
  const post = addPost()
  await tick()
  await reveal(post)
  expectCountry(post)
  const oldLink = author(post)
  const oldLabel = label(post)
  const replacement = oldLink.cloneNode(true)
  oldLink.replaceWith(replacement)
  await tick()
  expect(oldLabel.isConnected).toBe(false)
  expect(replacement.nextSibling).toBe(label(post))
  await reveal(post)
  expectCountry(post)
  expect(fetchMock).toHaveBeenCalledOnce()
  const currentLabel = label(post)
  post.remove()
  await tick()
  expect(currentLabel.parentNode).toBeNull()
  expect(observers.at(-1).targets.size).toBe(0)
})

test("removes labels when timestamps disappear and restores them after header replacement", async () => {
  const post = addPost()
  start()
  await reveal(post)
  const oldLabel = label(post)
  const header = post.querySelector(".author-header")
  const replacement = header.cloneNode(true)
  replacement.querySelector(LABEL).remove()
  post.querySelector(".timestamp").remove()
  await tick()
  expect(post.querySelector(LABEL)).toBeNull()
  expect(oldLabel.parentNode).toBeNull()
  header.replaceWith(replacement)
  await tick()
  await reveal(post)
  expectCountry(post)
  expect(fetchMock).toHaveBeenCalledOnce()
})

test("does not leak a confirmed value onto reused author hrefs", async () => {
  const post = addPost()
  start()
  await reveal(post)
  expectCountry(post)
  respond.mockResolvedValue(response(fixture.unavailable))
  setAuthor(post, "another", "second")
  await tick()
  expectUnknown(post)
  await reveal(post)
  await tick(1100)
  expectUnknown(post)
  expect(
    JSON.parse(new URLSearchParams(starts.at(-1).options.body).get("params")).target_user_id,
  ).toBe("1002")
  expect(post.querySelectorAll(LABEL)).toHaveLength(1)
})

test("keeps quoted posts and replies bound to their own author headers", async () => {
  history.replaceState(null, "", "/@example/post/first")
  respond.mockResolvedValueOnce(response()).mockResolvedValueOnce(response(fixture.unavailable))
  const outer = addPost()
  const quoted = addPost("another", "quoted")
  outer.querySelector(".body").append(quoted)
  const reply = addPost("example", "reply")
  start()
  await reveal(outer, quoted, reply)
  await tick(1100)
  expectCountry(outer)
  expectUnknown(quoted)
  expectCountry(reply)
  expect(document.querySelectorAll(LABEL)).toHaveLength(3)
  expect(author(outer).nextSibling).toBe(label(outer))
  expect(author(quoted).nextSibling).toBe(label(quoted))
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test.each([
  "nav",
  "aside",
  "navigation",
  "dialog",
  "profile",
  "mention",
  "ambiguous authors",
  "ambiguous posts",
  "search",
])("excludes the %s location", async (where) => {
  const post = addPost()
  if (["nav", "aside", "navigation", "dialog"].includes(where)) {
    const container = document.createElement(["nav", "aside"].includes(where) ? where : "div")
    if (["navigation", "dialog"].includes(where)) container.setAttribute("role", where)
    post.replaceWith(container)
    container.append(post)
  }
  if (where === "profile") post.querySelector(".timestamp").remove()
  if (where === "mention") {
    post.querySelector(".body").append(author(post))
  }
  if (where === "ambiguous authors") author(post).after(author(post).cloneNode(true))
  if (where === "ambiguous posts") {
    const other = post.querySelector(".timestamp").cloneNode(true)
    other.href = "/@another/post/other"
    post.querySelector(".author-header").append(other)
  }
  if (where === "search") history.replaceState(null, "", "/search?q=example")
  start()
  await tick(1000)
  expect(document.querySelectorAll(LABEL)).toHaveLength(0)
  expect(fetchMock).not.toHaveBeenCalled()
})

test.each([
  ["semantic footer", "footer", "@example"],
  ["div footer", "div", "@example"],
  ["bare-name body link", "div", "example"],
])("does not label a mention before a %s timestamp", async (_name, footer, text) => {
  const post = addPost()
  post.innerHTML = `
    <div class="post-content">
      <header>example</header>
      <div class="body">Text mentioning <a href="/@example">${text}</a><p>more text</p></div>
      <${footer}><a href="/@example/post/first"><time>now</time></a></${footer}>
    </div>
    <div class="post-actions"><button title="Like">Like</button></div>`
  start()
  await tick(1000)
  expect(post.querySelector(LABEL)).toBeNull()
  expect(fetchMock).not.toHaveBeenCalled()
})

test("does not cross plain body text to label a bare-name link before a div timestamp", async () => {
  const post = addPost()
  post.innerHTML = `
    <div>
      <div>example</div>
      <div>Text mentioning <a href="/@example">example</a></div>
      <div><a href="/@example/post/first"><time>now</time></a></div>
    </div>`
  start()
  await tick(1000)
  expect(post.querySelector(LABEL)).toBeNull()
  expect(fetchMock).not.toHaveBeenCalled()
})

test("restores its author styling after a native class update without removing native classes", async () => {
  const post = addPost()
  start()
  await reveal(post)
  const host = author(post).parentElement
  author(post).className = "author native-updated"
  host.className = "author-header native-host-updated"
  await tick()
  expect(author(post).classList.contains("native-updated")).toBe(true)
  expect(author(post).classList.contains("threads-country-label-author")).toBe(true)
  expect(host.classList.contains("native-host-updated")).toBe(true)
  expect(host.classList.contains("threads-country-label-host")).toBe(true)
  expectCountry(post)
  stop()
  expect(author(post).className).toBe("author native-updated")
  expect(host.className).toBe("author-header native-host-updated")
})

test("moves host styling with a reparented author and removes it on cleanup", async () => {
  const post = addPost()
  start()
  await reveal(post)
  const oldHost = author(post).parentElement
  const host = document.createElement("div")
  oldHost.insertBefore(host, author(post))
  host.append(author(post))
  await tick()
  expect(oldHost.classList.contains("threads-country-label-host")).toBe(false)
  expect(host.classList.contains("threads-country-label-host")).toBe(true)
  expectCountry(post)
  stop()
  expect(
    document.querySelector(".threads-country-label-host,.threads-country-label-author"),
  ).toBeNull()
})

test.each(["URL", "author", "removed row", "viewer", "identity"])(
  "rejects an asynchronous result after a change to the %s",
  async (change) => {
    // This fetch intentionally ignores abort so the stale-result guard is tested.
    const pending = deferred()
    respond.mockReturnValueOnce(pending.promise).mockResolvedValue(response(fixture.unavailable))
    const post = addPost()
    start()
    await reveal(post)
    const oldLabel = label(post)
    if (change === "URL") history.pushState(null, "", "/@another-view")
    if (change === "author") setAuthor(post, "another", "second")
    if (change === "removed row") post.remove()
    if (change === "viewer") contextData.textContent = JSON.stringify(modules("900002"))
    if (change === "identity") jsonData({ user: { username: "example", pk: "9999", id: "9999" } })
    await tick(350)
    pending.resolve(response())
    await tick(1200)
    expect(document.querySelectorAll(LABEL)).toSatisfy((labels) =>
      [...labels].every((node) => !node.textContent.includes("United States")),
    )
    if (change === "removed row") expect(oldLabel.parentNode).toBeNull()
    else expectUnknown(post)
  },
)

test.each(["URL", "viewer"])("clears confirmed cache entries after a %s change", async (change) => {
  const post = addPost()
  start()
  await reveal(post)
  expectCountry(post)
  if (change === "URL") history.pushState(null, "", "/@another-view")
  else contextData.textContent = JSON.stringify(modules("900002"))
  respond.mockResolvedValue(response(fixture.unavailable))
  await tick(350)
  expectUnknown(post)
  await reveal(post)
  await tick(1100)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expectUnknown(post)
})

test("does not suspend the new view because a stale request reports authentication failure", async () => {
  const pending = deferred()
  respond.mockReturnValueOnce(pending.promise)
  const post = addPost()
  start()
  await reveal(post)
  history.pushState(null, "", "/@another-view")
  pending.resolve(response({}, 401))
  await tick(350)
  await reveal(post)
  await tick(1100)
  expectCountry(post)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test("rejects stale results immediately after URL and viewer changes, before the DOM batch runs", async () => {
  const pending = deferred()
  respond.mockReturnValueOnce(pending.promise)
  const post = addPost()
  start()
  await reveal(post)
  history.pushState(null, "", "/@other")
  contextData.textContent = JSON.stringify(modules("900002"))
  pending.resolve(response())
  await tick(0)
  expectUnknown(post)
})

test.each(["viewer", "DTSGInitialData", "LSD", "WebBloksVersioningID"])(
  "does not request countries without the required %s page data",
  async (missing) => {
    const data = modules(missing === "viewer" ? "0" : "900001")
    if (missing !== "viewer") data.define = data.define.filter(([name]) => name !== missing)
    contextData.textContent = JSON.stringify(data)
    const post = addPost()
    start()
    await reveal(post)
    expectUnknown(post)
    expect(fetchMock).not.toHaveBeenCalled()
  },
)

test("keeps duplicate startup inert and cleanup idempotent with no leaked timers", async () => {
  pendingRequest()
  const post = addPost()
  const unrelated = document.createElement("style")
  unrelated.id = "other-script-style"
  document.head.append(unrelated)
  start()
  await reveal(post)
  const duplicateStop = script.runInThisContext()
  expect(duplicateStop).toBeTypeOf("function")
  duplicateStop()
  expect(document.querySelectorAll(`#${STYLE}`)).toHaveLength(1)
  expect(document.querySelectorAll(LABEL)).toHaveLength(1)
  stop()
  stop()
  await tick()
  expect(starts[0].options.signal.aborted).toBe(true)
  expect(document.querySelectorAll(LABEL)).toHaveLength(0)
  expect(document.getElementById(STYLE)).toBeNull()
  expect(document.getElementById("other-script-style")).toBe(unrelated)
  expect(observers.every((observer) => observer.targets.size === 0)).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  addPost("another", "later")
  await tick(2000)
  expect(document.querySelectorAll(LABEL)).toHaveLength(0)
  expect(fetchMock).toHaveBeenCalledOnce()
})

test("does not apply an abort-ignoring response after cleanup and permits a fresh start", async () => {
  const pending = deferred()
  respond.mockReturnValueOnce(pending.promise)
  const post = addPost()
  start()
  await reveal(post)
  stop()
  pending.resolve(response())
  await tick()
  expect(document.querySelectorAll(LABEL)).toHaveLength(0)
  expect(document.getElementById(STYLE)).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
  start()
  await reveal(post)
  expectCountry(post)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test("cleanup aborts a rate-spacing wait and prevents a later fetch", async () => {
  const post = addPost("fallback", "fallback-post")
  const profile = structuredClone(fixture.profile)
  profile.initialRouteInfo.route.url = "/@fallback"
  profile.initialRouteInfo.route.params.vanity = "@fallback"
  respond.mockResolvedValueOnce(response(profileHTML(profile, "/@fallback")))
  start()
  await reveal(post)
  expect(fetchMock).toHaveBeenCalledOnce()
  stop()
  await tick(2000)
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

test("coexists with Threads Saved Button without clicking any saved action", async () => {
  const post = addPost()
  jsonData({ posts: [{ code: "first", has_viewer_saved: true }] })
  const click = vi.fn()
  post.addEventListener("click", click)
  stopSaved = savedScript.runInThisContext()
  start()
  await reveal(post)
  const saved = post.querySelector("button.threads-saved-button")
  expect(saved).toBeInstanceOf(HTMLButtonElement)
  expect(saved.getAttribute("aria-pressed")).toBe("true")
  expect(saved.previousElementSibling).toBe(post.querySelector(".share-action"))
  expectCountry(post)
  expect(click).not.toHaveBeenCalled()
  stop()
  await tick()
  expect(saved.isConnected).toBe(true)
  expect(document.getElementById("threads-saved-button-style")).not.toBeNull()
  expect(saved.getAttribute("aria-pressed")).toBe("true")
  expect(click).not.toHaveBeenCalled()
  stopSaved()
  expect(vi.getTimerCount()).toBe(0)
})
