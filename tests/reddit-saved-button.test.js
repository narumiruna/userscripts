// @vitest-environment jsdom
import { Script } from "node:vm"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import source from "../src/reddit-saved-button/reddit-saved-button.user.js?raw"

const script = new Script(source)
const BUTTON = "button.reddit-saved-button"
const STYLE = "reddit-saved-button-style"
let stop

function startRedditSavedButton() {
  const cleanup = script.runInThisContext()
  if (typeof cleanup !== "function") throw new Error("Expected userscript cleanup")
  return cleanup
}

function addPost(
  id = "first",
  { shadow = true, shareSlot = true, loggedIn = false, saved = false } = {},
) {
  const post = document.createElement("shreddit-post")
  post.id = `t3_${id}`
  const menu = document.createElement("shreddit-post-overflow-menu")
  menu.setAttribute("post-id", post.id)
  if (loggedIn) menu.setAttribute("is-logged-in", "")
  if (saved) menu.setAttribute("is-post-saved", "")
  menu.innerHTML =
    '<button type="button" aria-label="Open user actions" aria-haspopup="menu" aria-expanded="false"><svg></svg></button>'
  menu.attachShadow({ mode: "open" }).innerHTML =
    '<rpl-dropdown><slot></slot><faceplate-menu slot="content" hidden></faceplate-menu></rpl-dropdown>'
  const header = document.createElement("div")
  header.className = "post-header"
  header.append(menu)
  post.append(header)
  const root = shadow ? post.attachShadow({ mode: "open" }) : post
  if (shadow) root.innerHTML = "<slot></slot>"
  const row = document.createElement("div")
  row.setAttribute("data-testid", "action-row")
  row.innerHTML = `
    <span><button type="button">Upvote</button><button type="button">Downvote</button></span>
    <a href="/r/example/comments/${id}/post/">Comments</a>
    ${shareSlot ? '<slot name="share-button">' : ""}<shreddit-post-share-button source-id="${post.id}"></shreddit-post-share-button>${shareSlot ? "</slot>" : ""}
    <div class="mod-actions"></div>
  `
  root.append(row)
  document.body.append(post)
  return { post, root, row, menu, trigger: menu.querySelector("button"), share: row.children[2] }
}

function showMenu(trigger, label = "Save") {
  const menu = trigger.closest("shreddit-post-overflow-menu") || trigger.getRootNode().host
  const root = menu.shadowRoot || menu
  const content = root.querySelector("faceplate-menu")
  content.innerHTML = `<li id="post-overflow-save"><div role="menuitem" tabindex="0"><svg><title>Save</title></svg><span>${label}</span></div></li>`
  content.hidden = false
  root.querySelector("rpl-dropdown")?.setAttribute("open", "")
  trigger.setAttribute("aria-expanded", "true")
  const item = content.querySelector('[role="menuitem"]')
  const click = vi.fn(() => {
    content.hidden = true
    trigger.setAttribute("aria-expanded", "false")
    root.querySelector("rpl-dropdown")?.removeAttribute("open")
  })
  item.addEventListener("click", click)
  return { menu: content, item, click }
}

function injected(fixture) {
  const button = fixture.root.querySelector(BUTTON)
  if (!(button instanceof HTMLButtonElement)) throw new Error("Expected an injected save button")
  return button
}

function expectSaved(fixture, saved) {
  const button = injected(fixture)
  expect(button.dataset.saved).toBe(saved === undefined ? "unknown" : String(saved))
  expect(button.getAttribute("aria-pressed")).toBe(saved === undefined ? null : String(saved))
  expect(button.querySelector("path").getAttribute("fill")).toBe(saved ? "currentColor" : "none")
  expect(button.querySelector("path").hasAttribute("stroke-dasharray")).toBe(saved === undefined)
}

async function tick(ms = 60) {
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
  document.head.innerHTML = ""
  document.body.innerHTML = ""
  history.replaceState(null, "", "/")
  stop = () => {}
  // jsdom has no layout. Chromium checks use real element geometry.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function () {
    for (let parent = this; parent; ) {
      if (parent.hidden || getComputedStyle(parent).display === "none") return []
      const root = parent.getRootNode()
      parent = parent.parentElement || (root instanceof ShadowRoot ? root.host : null)
    }
    return [new DOMRect(0, 0, 32, 32)]
  })
})

afterEach(async () => {
  stop()
  await Promise.resolve()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test("the exact source has installable Reddit metadata and no runtime dependencies", () => {
  const header = source.match(/^\/\/ ==UserScript==\n[\s\S]*?\/\/ ==\/UserScript==/)
  expect(header).not.toBeNull()
  expect(header[0]).toMatch(/^\/\/ @name\s+Reddit Saved Button$/m)
  expect(header[0]).toMatch(/^\/\/ @namespace\s+userscripts\/reddit-saved-button$/m)
  expect(header[0]).toMatch(/^\/\/ @version\s+0\.1\.0$/m)
  expect(header[0]).toMatch(/^\/\/ @grant\s+none$/m)
  expect(header[0]).toMatch(/^\/\/ @noframes$/m)
  expect(header[0]).toMatch(/^\/\/ @run-at\s+document-idle$/m)
  expect([...header[0].matchAll(/^\/\/ @match\s+(.+)$/gm)].map((match) => match[1])).toEqual([
    "https://www.reddit.com/*",
    "https://reddit.com/*",
  ])
  const installUrl =
    "https://raw.githubusercontent.com/narumiruna/userscripts/main/src/reddit-saved-button/reddit-saved-button.user.js"
  for (const field of ["downloadURL", "updateURL"]) {
    expect(source.match(new RegExp(`^// @${field}\\s+(.+)$`, "m"))?.[1]).toBe(installUrl)
  }
  expect(() => new Script(source)).not.toThrow()
  expect(source).not.toMatch(/\brequire\s*\(/)
  expect(source).not.toMatch(/^\s*(import|export)\s/m)
  expect(source).not.toMatch(/^\/\/ @(require|resource)\s/m)
  stop = startRedditSavedButton()
  expect(window.startRedditSavedButton).toBeUndefined()
  expect(window.postActions).toBeUndefined()
})

test.each([
  { shadow: true, shareSlot: true },
  { shadow: true, shareSlot: false },
  { shadow: false, shareSlot: false },
])("places an accessible bookmark after Share with %j", (options) => {
  const fixture = addPost("first", options)
  stop = startRedditSavedButton()
  const button = injected(fixture)
  expect(button.previousElementSibling).toBe(fixture.share)
  expect(button.parentElement).toBe(fixture.row)
  expect(fixture.post.querySelector(".post-header").contains(button)).toBe(false)
  expect(button.type).toBe("button")
  expect(button.title).toBe("Save / unsave (state unavailable)")
  expect(button.getAttribute("aria-label")).toBe(button.title)
  expectSaved(fixture, undefined)
  expect(button.getRootNode().querySelector(`#${STYLE}`)).not.toBeNull()
})

test("does not duplicate UI after startup or repeated mutations", async () => {
  const fixture = addPost()
  stop = startRedditSavedButton()
  startRedditSavedButton()()
  document.body.append(document.createElement("div"))
  await tick()
  expect(fixture.root.querySelectorAll(BUTTON)).toHaveLength(1)
  expect(fixture.root.querySelectorAll(`#${STYLE}`)).toHaveLength(1)
  expect(document.querySelectorAll(`#${STYLE}`)).toHaveLength(1)
})

test.each([true, false])(
  "reads the native logged-in saved flag %s without opening a menu",
  (saved) => {
    const fixture = addPost("first", { loggedIn: true, saved })
    const click = vi.fn()
    fixture.trigger.addEventListener("click", click)
    const fetch = vi.spyOn(globalThis, "fetch")
    const storage = vi.spyOn(Storage.prototype, "setItem")
    stop = startRedditSavedButton()
    expectSaved(fixture, saved)
    expect(click).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(storage).not.toHaveBeenCalled()
  },
)

test("does not treat missing logged-out flags as unsaved", () => {
  const fixture = addPost()
  stop = startRedditSavedButton()
  expectSaved(fixture, undefined)
})

test("reads updated native flags and preserves optimistic state over an unchanged snapshot", async () => {
  const fixture = addPost("first", { loggedIn: true })
  fixture.trigger.addEventListener("click", () => showMenu(fixture.trigger))
  stop = startRedditSavedButton()
  expectSaved(fixture, false)
  injected(fixture).click()
  await tick()
  expectSaved(fixture, true)
  document.body.append(document.createElement("div"))
  await tick()
  expectSaved(fixture, true)
  fixture.menu.setAttribute("is-post-saved", "")
  await tick()
  fixture.menu.removeAttribute("is-post-saved")
  await tick()
  expectSaved(fixture, false)
})

test.each([
  "Save",
  "Unsave",
  "Remove from saved",
  "儲存",
  "取消儲存",
  "保存",
  "取消保存",
  "收藏",
  "取消收藏",
])("dispatches only the native %s action in this post's shadow menu", async (label) => {
  const fixture = addPost()
  let action
  fixture.trigger.addEventListener("click", () => {
    action = showMenu(fixture.trigger, label)
  })
  const postClick = vi.fn((event) =>
    event.composedPath().some((node) => node instanceof Element && node.matches(BUTTON)),
  )
  fixture.post.addEventListener("click", postClick)
  stop = startRedditSavedButton()
  const button = injected(fixture)
  button.click()
  expect(button.disabled).toBe(true)
  expect(button.getAttribute("aria-busy")).toBe("true")
  await tick()
  expect(action.click).toHaveBeenCalledOnce()
  expect(button.disabled).toBe(false)
  expect(button.hasAttribute("aria-busy")).toBe(false)
  expectSaved(
    fixture,
    !["Unsave", "Remove from saved", "取消儲存", "取消保存", "取消收藏"].includes(label),
  )
  expect(postClick.mock.results.every((result) => result.value === false)).toBe(true)
  expect(document.getElementById("reddit-saved-button-status").textContent).toContain(
    "Reddit action requested:",
  )
})

test("reads the action again for every toggle", async () => {
  const fixture = addPost()
  const actions = []
  fixture.trigger.addEventListener("click", () => {
    actions.push(showMenu(fixture.trigger, actions.length ? "Unsave" : "Save"))
  })
  stop = startRedditSavedButton()
  injected(fixture).click()
  await tick()
  expectSaved(fixture, true)
  injected(fixture).click()
  await tick()
  expectSaved(fixture, false)
  expect(actions).toHaveLength(2)
  for (const action of actions) expect(action.click).toHaveBeenCalledOnce()
})

test("supports a trigger and action rendered inside the overflow shadow root", async () => {
  const fixture = addPost()
  fixture.menu.shadowRoot.prepend(fixture.trigger)
  fixture.trigger.addEventListener("click", () => showMenu(fixture.trigger))
  stop = startRedditSavedButton()
  injected(fixture).click()
  await tick()
  expectSaved(fixture, true)
})

test("supports a light-DOM native menu", async () => {
  const fixture = addPost()
  fixture.menu.append(...fixture.menu.shadowRoot.childNodes)
  fixture.menu.shadowRoot.innerHTML = "<slot></slot>"
  fixture.trigger.addEventListener("click", () => {
    const content = fixture.menu.querySelector("faceplate-menu")
    content.hidden = false
    content.innerHTML = '<button type="button">Save</button>'
    fixture.trigger.setAttribute("aria-expanded", "true")
    content.querySelector("button").addEventListener("click", () => {
      content.hidden = true
      fixture.trigger.setAttribute("aria-expanded", "false")
    })
  })
  stop = startRedditSavedButton()
  injected(fixture).click()
  await tick()
  expectSaved(fixture, true)
})

test("waits for a delayed native action", async () => {
  const fixture = addPost()
  let action
  fixture.trigger.addEventListener("click", () => {
    window.setTimeout(() => {
      action = showMenu(fixture.trigger)
    }, 150)
  })
  stop = startRedditSavedButton()
  injected(fixture).click()
  await tick(250)
  expect(action.click).toHaveBeenCalledOnce()
})

test("tracks a manually opened menu and native save/unsave across the shadow boundary", async () => {
  const fixture = addPost()
  let action
  fixture.trigger.addEventListener("click", () => {
    action = showMenu(fixture.trigger, "Unsave")
  })
  stop = startRedditSavedButton()
  fixture.trigger.click()
  await tick()
  expectSaved(fixture, true)
  action.item.querySelector("span").click()
  await tick()
  expectSaved(fixture, false)
})

test("corrects optimistic state when the native menu still reports Save", async () => {
  const fixture = addPost()
  fixture.trigger.addEventListener("click", () => showMenu(fixture.trigger))
  stop = startRedditSavedButton()
  injected(fixture).click()
  await tick()
  expectSaved(fixture, true)
  fixture.trigger.click()
  await tick()
  expectSaved(fixture, false)
})

test("updates duplicate copies without opening a different post's menu", async () => {
  const first = addPost()
  const duplicate = addPost()
  const other = addPost("other")
  const firstClick = vi.fn(() => showMenu(first.trigger))
  const otherClick = vi.fn()
  first.trigger.addEventListener("click", firstClick)
  other.trigger.addEventListener("click", otherClick)
  stop = startRedditSavedButton()
  injected(first).click()
  await tick()
  expectSaved(first, true)
  expectSaved(duplicate, true)
  expectSaved(other, undefined)
  expect(firstClick).toHaveBeenCalledOnce()
  expect(otherClick).not.toHaveBeenCalled()
})

test("handles dynamic posts, action-row replacement, and native-menu replacement", async () => {
  stop = startRedditSavedButton()
  const fixture = addPost()
  await tick()
  expect(fixture.root.querySelectorAll(BUTTON)).toHaveLength(1)
  const row = fixture.row.cloneNode(true)
  row.querySelector(BUTTON).remove()
  fixture.row.replaceWith(row)
  await tick()
  expect(injected(fixture).parentElement).toBe(row)
  const menu = fixture.menu.cloneNode(true)
  fixture.menu.replaceWith(menu)
  await tick()
  expect(fixture.root.querySelectorAll(BUTTON)).toHaveLength(1)
  menu.remove()
  await tick()
  expect(fixture.root.querySelector(BUTTON)).toBeNull()
})

test("waits for an action row rendered later inside a shadow root", async () => {
  const fixture = addPost()
  fixture.row.remove()
  stop = startRedditSavedButton()
  expect(fixture.root.querySelector(BUTTON)).toBeNull()
  fixture.root.append(fixture.row)
  await tick()
  expect(injected(fixture).parentElement).toBe(fixture.row)
})

test("does not mix a main post with a nested crosspost", () => {
  const outer = addPost("outer")
  const nested = addPost("nested")
  outer.post.append(nested.post)
  stop = startRedditSavedButton()
  expect(injected(outer).parentElement).toBe(outer.row)
  expect(injected(nested).parentElement).toBe(nested.row)
})

test.each(["missing-id", "wrong-menu", "multiple-menus", "missing-share", "multiple-rows"])(
  "does not fall back to a header or another post for %s",
  (kind) => {
    const fixture = addPost()
    if (kind === "missing-id") fixture.post.removeAttribute("id")
    if (kind === "wrong-menu") fixture.menu.setAttribute("post-id", "t3_other")
    if (kind === "multiple-menus") fixture.post.append(fixture.menu.cloneNode(true))
    if (kind === "missing-share") fixture.share.remove()
    if (kind === "multiple-rows") fixture.root.append(fixture.row.cloneNode(true))
    stop = startRedditSavedButton()
    expect(fixture.root.querySelector(BUTTON)).toBeNull()
    expect(fixture.post.querySelector(BUTTON)).toBeNull()
  },
)

test.each(["disabled", "hidden", "duplicate", "unknown", "absent"])(
  "does not select a %s save action or substitute Report",
  async (kind) => {
    const fixture = addPost()
    let action
    const reportClick = vi.fn()
    fixture.trigger.addEventListener("click", () => {
      action = showMenu(fixture.trigger, kind === "unknown" ? "Guardar" : "Save")
      if (kind === "disabled") action.item.setAttribute("aria-disabled", "true")
      if (kind === "hidden") action.item.hidden = true
      if (kind === "duplicate") action.menu.append(action.item.cloneNode(true))
      if (kind === "absent") action.item.remove()
      const report = document.createElement("button")
      report.setAttribute("role", "menuitem")
      report.textContent = "Report"
      report.addEventListener("click", reportClick)
      action.menu.append(report)
    })
    stop = startRedditSavedButton()
    injected(fixture).click()
    await tick(2600)
    expect(action.click).not.toHaveBeenCalled()
    expect(reportClick).not.toHaveBeenCalled()
    expectSaved(fixture, undefined)
    expect(injected(fixture).disabled).toBe(false)
    expect(fixture.trigger.getAttribute("aria-expanded")).toBe("true")
    expect(document.getElementById("reddit-saved-button-status").textContent).toContain(
      "Save action unavailable",
    )
  },
)

test.each(["native", "shadow-share", "portal"])("blocks an existing %s menu", async (kind) => {
  const fixture = addPost()
  const click = vi.fn()
  fixture.trigger.addEventListener("click", click)
  if (kind === "native") showMenu(fixture.trigger)
  if (kind === "shadow-share") {
    fixture.row
      .querySelector("shreddit-post-share-button")
      .attachShadow({ mode: "open" }).innerHTML =
      '<button aria-haspopup="menu" aria-expanded="true">Share</button>'
  }
  if (kind === "portal") {
    const menu = document.createElement("div")
    menu.setAttribute("role", "menu")
    document.body.append(menu)
  }
  stop = startRedditSavedButton()
  injected(fixture).click()
  await tick()
  expect(click).not.toHaveBeenCalled()
  expect(document.getElementById("reddit-saved-button-status").textContent).toContain(
    "Close the open menu",
  )
})

test("allows only one pending shortcut operation", async () => {
  const first = addPost()
  const other = addPost("other")
  const firstClick = vi.fn()
  const otherClick = vi.fn()
  first.trigger.addEventListener("click", firstClick)
  other.trigger.addEventListener("click", otherClick)
  stop = startRedditSavedButton()
  injected(first).click()
  injected(other).click()
  await tick()
  expect(firstClick).toHaveBeenCalledOnce()
  expect(otherClick).not.toHaveBeenCalled()
})

test.each(["pointer", "keyboard", "navigation", "push-state", "disconnect", "recycle", "closed"])(
  "cancels a delayed native action on %s",
  async (kind) => {
    const fixture = addPost()
    let action
    fixture.trigger.addEventListener("click", () => {
      fixture.trigger.setAttribute("aria-expanded", "true")
      window.setTimeout(() => {
        action = showMenu(fixture.trigger)
      }, 200)
    })
    stop = startRedditSavedButton()
    const button = injected(fixture)
    button.click()
    if (kind === "pointer") document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    if (kind === "keyboard")
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    if (kind === "navigation") window.dispatchEvent(new PopStateEvent("popstate"))
    if (kind === "push-state") history.pushState(null, "", "/r/other/")
    if (kind === "disconnect") fixture.post.remove()
    if (kind === "recycle") {
      fixture.post.id = "t3_second"
      fixture.menu.setAttribute("post-id", "t3_second")
    }
    if (kind === "closed") fixture.trigger.setAttribute("aria-expanded", "false")
    await tick(300)
    expect(action.click).not.toHaveBeenCalled()
    expect(button.disabled).toBe(false)
  },
)

test("does not reuse saved flags or an open menu when a post node is recycled", async () => {
  const fixture = addPost("first", { loggedIn: true, saved: true })
  fixture.trigger.addEventListener("click", () => showMenu(fixture.trigger, "Unsave"))
  stop = startRedditSavedButton()
  fixture.trigger.click()
  await tick()
  expectSaved(fixture, true)
  fixture.post.id = "t3_second"
  fixture.menu.setAttribute("post-id", "t3_second")
  fixture.row.querySelector("shreddit-post-share-button").setAttribute("source-id", "t3_second")
  await tick()
  expectSaved(fixture, undefined)
})

test("clears observed state on client-side navigation", async () => {
  const fixture = addPost("first", { loggedIn: true, saved: true })
  stop = startRedditSavedButton()
  expectSaved(fixture, true)
  history.pushState(null, "", "/r/other/")
  window.dispatchEvent(new Event("afterRoute"))
  await tick()
  expectSaved(fixture, undefined)
})

test.each([true, false])("rejects a Share control for another post with a slot=%s", (shareSlot) => {
  const fixture = addPost("first", { shareSlot })
  fixture.row.querySelector("shreddit-post-share-button").setAttribute("source-id", "t3_other")
  stop = startRedditSavedButton()
  expect(fixture.root.querySelector(BUTTON)).toBeNull()
})

test("does not attach after an empty Share slot", () => {
  const fixture = addPost()
  fixture.row.querySelector("shreddit-post-share-button").remove()
  stop = startRedditSavedButton()
  expect(fixture.root.querySelector(BUTTON)).toBeNull()
})

test("supports a Share component assigned from the post light DOM", () => {
  const fixture = addPost()
  const share = fixture.row.querySelector("shreddit-post-share-button")
  share.setAttribute("slot", "share-button")
  fixture.post.append(share)
  stop = startRedditSavedButton()
  expect(injected(fixture).previousElementSibling).toBe(fixture.share)
})

test("keeps the shortcut after a wrapped Share control", () => {
  const fixture = addPost("first", { shareSlot: false })
  const wrapper = document.createElement("span")
  fixture.share.replaceWith(wrapper)
  wrapper.append(fixture.share)
  stop = startRedditSavedButton()
  expect(injected(fixture).previousElementSibling).toBe(wrapper)
})

test("restores a removed button and shadow stylesheet after a complete root rerender", async () => {
  const fixture = addPost("first", { loggedIn: true, saved: true })
  stop = startRedditSavedButton()
  const row = fixture.row.cloneNode(true)
  row.querySelector(BUTTON).remove()
  fixture.root.replaceChildren(row)
  await tick()
  expectSaved(fixture, true)
  expect(fixture.root.querySelectorAll(BUTTON)).toHaveLength(1)
  expect(fixture.root.querySelectorAll(`#${STYLE}`)).toHaveLength(1)
})

test("cancels when the native trigger becomes disabled before the action appears", async () => {
  const fixture = addPost()
  let action
  fixture.trigger.addEventListener("click", () => {
    window.setTimeout(() => {
      fixture.trigger.disabled = true
      action = showMenu(fixture.trigger)
    }, 100)
  })
  stop = startRedditSavedButton()
  injected(fixture).click()
  await tick(200)
  expect(action.click).not.toHaveBeenCalled()
  // The open native Save label can still establish the current unsaved state.
  expectSaved(fixture, false)
})

test("does not dispatch through a replaced menu while waiting", async () => {
  const fixture = addPost()
  let action
  fixture.trigger.addEventListener("click", () => {
    window.setTimeout(() => {
      const replacement = fixture.menu.cloneNode(true)
      fixture.menu.replaceWith(replacement)
      action = showMenu(fixture.trigger)
    }, 100)
  })
  stop = startRedditSavedButton()
  injected(fixture).click()
  await tick(200)
  expect(action.click).not.toHaveBeenCalled()
})

test("detects a late custom-element upgrade without a light-DOM mutation", async () => {
  const fixture = addPost("first", { shadow: false })
  fixture.row.remove()
  stop = startRedditSavedButton()
  fixture.root = fixture.post.attachShadow({ mode: "open" })
  fixture.root.innerHTML = "<slot></slot>"
  fixture.root.append(fixture.row)
  if (!customElements.get("shreddit-post")) {
    customElements.define("shreddit-post", class extends HTMLElement {})
  }
  await tick()
  expect(injected(fixture).parentElement).toBe(fixture.row)
})

test("accepts flags that change with an atomic post-node recycle", async () => {
  const fixture = addPost("first", { loggedIn: true, saved: true })
  stop = startRedditSavedButton()
  expectSaved(fixture, true)
  fixture.post.id = "t3_second"
  fixture.menu.setAttribute("post-id", "t3_second")
  fixture.row.querySelector("shreddit-post-share-button").setAttribute("source-id", "t3_second")
  fixture.menu.removeAttribute("is-post-saved")
  await tick()
  expectSaved(fixture, false)
})

test("does not assign a recycled menu's click to the old post before refresh", async () => {
  const fixture = addPost("first", { loggedIn: true, saved: true })
  const duplicate = addPost("first", { loggedIn: true, saved: true })
  let action
  fixture.trigger.addEventListener("click", () => {
    action = showMenu(fixture.trigger, "Unsave")
  })
  stop = startRedditSavedButton()
  fixture.trigger.click()
  await tick()
  fixture.post.id = "t3_second"
  fixture.menu.setAttribute("post-id", "t3_second")
  fixture.row.querySelector("shreddit-post-share-button").setAttribute("source-id", "t3_second")
  action.item.click()
  expectSaved(duplicate, true)
  await tick()
  expectSaved(duplicate, true)
  expectSaved(fixture, undefined)
})

test.each(["data-testid", "name", "class", "style"])(
  "detects a post-startup layout change through %s",
  async (attribute) => {
    const fixture = addPost()
    if (attribute === "data-testid") fixture.row.removeAttribute("data-testid")
    if (attribute === "name") {
      const share = fixture.row.querySelector("shreddit-post-share-button")
      share.setAttribute("slot", "share-button")
      fixture.post.append(share)
      fixture.share.setAttribute("name", "other")
    }
    if (attribute === "class") {
      const style = document.createElement("style")
      style.textContent = ".hidden-action-row { display: none; }"
      fixture.root.append(style)
      // jsdom does not apply Shadow DOM styles; use a document stylesheet for this check.
      document.head.append(style.cloneNode(true))
      fixture.row.className = "hidden-action-row"
    }
    if (attribute === "style") fixture.row.style.display = "none"
    stop = startRedditSavedButton()
    await tick(120)
    expect(fixture.root.querySelector(BUTTON)).toBeNull()
    if (attribute === "data-testid") fixture.row.setAttribute("data-testid", "action-row")
    if (attribute === "name") fixture.share.setAttribute("name", "share-button")
    if (attribute === "class") fixture.row.className = ""
    if (attribute === "style") fixture.row.style.display = ""
    await tick()
    expect(injected(fixture).parentElement).toBe(fixture.row)
  },
)

test("detects a row that becomes visible after a viewport resize", async () => {
  const fixture = addPost()
  const rects = vi.spyOn(fixture.row, "getClientRects").mockReturnValue([])
  stop = startRedditSavedButton()
  await tick(120)
  expect(fixture.root.querySelector(BUTTON)).toBeNull()
  rects.mockReturnValue([new DOMRect(0, 0, 320, 32)])
  window.dispatchEvent(new Event("resize"))
  await tick()
  expect(injected(fixture).parentElement).toBe(fixture.row)
})

test("removes injected UI, shadow styles, observers, and pending timers on cleanup", async () => {
  const fixture = addPost()
  stop = startRedditSavedButton()
  injected(fixture).click()
  stop()
  await tick()
  fixture.root.append(document.createElement("div"))
  document.body.append(document.createElement("div"))
  await tick()
  expect(fixture.root.querySelector(BUTTON)).toBeNull()
  expect(fixture.root.querySelector(`#${STYLE}`)).toBeNull()
  expect(document.getElementById(STYLE)).toBeNull()
  expect(document.getElementById("reddit-saved-button-status")).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})
