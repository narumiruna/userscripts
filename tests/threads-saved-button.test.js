// @vitest-environment jsdom
import { Script } from "node:vm"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import source from "../src/threads-saved-button/threads-saved-button.user.js?raw"

const script = new Script(source)

function startThreadsSavedButton() {
  const cleanup = script.runInThisContext()
  if (typeof cleanup !== "function") throw new Error("Expected userscript cleanup")
  return cleanup
}

const BUTTON = "button.threads-saved-button"
let stop
let menuId = 0

function addPost(id = "first", icon = '<svg title="More"><title>More</title></svg>') {
  const post = document.createElement("section")
  post.innerHTML = `
    <div>
      <div><a href="/@example/post/${id}"><time datetime="2026-11-02">now</time></a></div>
      <div style="display: flex"><div>
        <div role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false">
          <div>${icon}</div>
        </div>
      </div></div>
    </div>
    <div class="post-actions" style="display: flex; align-items: center">
      <div><button type="button"><svg title="Like"></svg><span>100</span></button></div>
      <div><button type="button"><svg title="Comment"></svg><span>20</span></button></div>
      <div><button type="button"><svg title="Repost"></svg><span>3</span></button></div>
      <div class="share-action"><button type="button"><svg title="Share"></svg><span>641</span></button></div>
    </div>
  `
  document.body.append(post)
  const trigger = post.querySelector('[aria-haspopup="menu"]')
  if (!(trigger instanceof HTMLElement)) throw new Error("Expected a native menu trigger")
  return { post, trigger }
}

function setPagePosts(posts) {
  const script = document.createElement("script")
  script.type = "application/json"
  script.textContent = JSON.stringify({ require: [{ __bbox: { result: { data: { posts } } } }] })
  document.head.append(script)
  return script
}

function expectSaved(post, saved) {
  const button = injected(post)
  expect(button.dataset.saved).toBe(saved === undefined ? "unknown" : String(saved))
  expect(button.querySelector("path").getAttribute("fill")).toBe(saved ? "currentColor" : "none")
  expect(button.getAttribute("aria-pressed")).toBe(saved === undefined ? null : String(saved))
  expect(button.querySelector("path").hasAttribute("stroke-dasharray")).toBe(saved === undefined)
}

function showMenu(trigger, label = "Save", controlled = true) {
  const menu = document.createElement("div")
  menu.id = `native-post-menu-${++menuId}`
  menu.setAttribute("role", "menu")
  const item = document.createElement("div")
  item.setAttribute("role", "menuitem")
  // SVG titles must not duplicate the visible action label.
  item.innerHTML = `<svg title="${label ? "Save" : ""}"></svg><span>${label}</span>`
  menu.append(item)
  trigger.setAttribute("aria-expanded", "true")
  if (controlled) trigger.setAttribute("aria-controls", menu.id)
  document.body.append(menu)
  const click = vi.fn(() => {
    menu.remove()
    trigger.setAttribute("aria-expanded", "false")
  })
  item.addEventListener("click", click)
  return { menu, item, click }
}

function injected(post) {
  const button = post.querySelector(BUTTON)
  if (!(button instanceof HTMLButtonElement)) throw new Error("Expected an injected save button")
  return button
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
  menuId = 0
  // jsdom has no layout. Real visibility is also checked in the Chromium smoke test.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function () {
    for (let parent = this; parent; parent = parent.parentElement) {
      if (parent.hidden || getComputedStyle(parent).display === "none") {
        return []
      }
    }
    return [new DOMRect(0, 0, 24, 24)]
  })
})

afterEach(async () => {
  stop()
  await Promise.resolve()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test.each([
  '<svg title="More"><title>More</title></svg>',
  '<svg aria-label="More"></svg>',
  '<svg aria-label="更多"></svg>',
  '<svg title="更多選項"><title>更多選項</title></svg>',
])("adds an accessible shortcut for the native icon %s", (icon) => {
  const { post, trigger } = addPost("first", icon)
  stop = startThreadsSavedButton()
  const button = injected(post)

  expect(button.title).toBe("Save / unsave (state unavailable)")
  expect(button.getAttribute("aria-label")).toBe("Save / unsave (state unavailable)")
  expect(button.previousElementSibling).toBe(post.querySelector(".share-action"))
  expect(button.parentElement).toBe(post.querySelector(".post-actions"))
  expect(post.firstElementChild.contains(button)).toBe(false)
  expect(button.type).toBe("button")
  expect(button.contains(trigger)).toBe(false)
  expect(trigger.contains(button)).toBe(false)
})

test("ignores navigation menus and menus without a post timestamp", () => {
  const { post } = addPost()
  const nav = document.createElement("nav")
  post.replaceWith(nav)
  nav.append(post)
  const unrelated = document.createElement("div")
  unrelated.innerHTML = '<button aria-haspopup="menu"><svg aria-label="More"></svg></button>'
  document.body.append(unrelated)
  stop = startThreadsSavedButton()

  expect(document.querySelectorAll(BUTTON)).toHaveLength(0)
})

test("ignores headers that contain multiple post identities", () => {
  const { post } = addPost()
  const second = document.createElement("a")
  second.href = "/@example/post/second"
  second.innerHTML = "<time>now</time>"
  post.firstElementChild?.append(second)
  stop = startThreadsSavedButton()
  expect(document.querySelectorAll(BUTTON)).toHaveLength(0)
})

test("does not duplicate buttons after startup or DOM mutations", async () => {
  addPost()
  stop = startThreadsSavedButton()
  const duplicateStop = startThreadsSavedButton()
  duplicateStop()
  document.body.append(document.createElement("div"))
  await tick()

  expect(document.querySelectorAll(BUTTON)).toHaveLength(1)
  expect(document.querySelectorAll("#threads-saved-button-style")).toHaveLength(1)
})

test("handles dynamically added posts and replaced native triggers", async () => {
  stop = startThreadsSavedButton()
  const { post, trigger } = addPost()
  await tick()
  expect(post.querySelectorAll(BUTTON)).toHaveLength(1)

  const replacement = trigger.cloneNode(true)
  trigger.replaceWith(replacement)
  await tick()
  expect(post.querySelectorAll(BUTTON)).toHaveLength(1)

  replacement.parentNode?.removeChild(replacement)
  await tick()
  expect(post.querySelectorAll(BUTTON)).toHaveLength(0)
})

test.each(["Save", "Unsave", "Remove from saved", "儲存", "取消儲存", "保存", "取消保存"])(
  "dispatches the exact native %s action without claiming server confirmation",
  async (label) => {
    const { post, trigger } = addPost()
    let action
    trigger.addEventListener("click", () => {
      action = showMenu(trigger, label)
    })
    stop = startThreadsSavedButton()
    const button = injected(post)

    button.click()
    expect(button.disabled).toBe(true)
    await tick()

    expect(action?.click).toHaveBeenCalledOnce()
    expect(button.disabled).toBe(false)
    expect(button.hasAttribute("aria-busy")).toBe(false)
    const nextSaved = !["Unsave", "Remove from saved", "取消儲存", "取消保存"].includes(label)
    expectSaved(post, nextSaved)
    expect(button.title).toBe(nextSaved ? "Unsave" : "Save")
    expect(document.getElementById("threads-saved-button-status")?.textContent).toContain(
      "Threads action requested:",
    )
  },
)

test.each(["button", "role-button"])("supports native %s menu controls", async (kind) => {
  const { post, trigger } = addPost()
  let click
  trigger.addEventListener("click", () => {
    const action = showMenu(trigger)
    const item = document.createElement(kind === "button" ? "button" : "div")
    if (kind === "role-button") item.setAttribute("role", "button")
    item.textContent = "Save"
    click = action.click
    item.addEventListener("click", action.click)
    action.item.replaceWith(item)
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick()
  expect(click).toHaveBeenCalledOnce()
})

test("reads the native action again after each click and after post-node reuse", async () => {
  const { post, trigger } = addPost()
  const actions = []
  trigger.addEventListener("click", () => {
    actions.push(showMenu(trigger, actions.length === 0 ? "Unsave" : "Save"))
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick()

  const link = post.querySelector("a")
  link.href = "/@example/post/recycled"
  injected(post).click()
  await tick()

  expect(actions).toHaveLength(2)
  for (const action of actions) expect(action.click).toHaveBeenCalledOnce()
})

test("waits for an asynchronously rendered native menu and its label", async () => {
  const { post, trigger } = addPost()
  let action
  trigger.addEventListener("click", () => {
    window.setTimeout(() => {
      action = showMenu(trigger, "")
      window.setTimeout(() => {
        if (action) action.item.textContent = "Save"
      }, 100)
    }, 100)
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick(150)
  expect(action?.click).not.toHaveBeenCalled()
  await tick(100)
  expect(action?.click).toHaveBeenCalledOnce()
})

test("serializes clicks across posts", async () => {
  const first = addPost()
  const second = addPost("second")
  const firstOpen = vi.fn(() => {
    window.setTimeout(() => showMenu(first.trigger), 100)
  })
  const secondOpen = vi.fn(() => showMenu(second.trigger))
  first.trigger.addEventListener("click", firstOpen)
  second.trigger.addEventListener("click", secondOpen)
  stop = startThreadsSavedButton()

  injected(first.post).click()
  injected(second.post).click()
  await tick(150)
  expect(firstOpen).toHaveBeenCalledOnce()
  expect(secondOpen).not.toHaveBeenCalled()

  injected(second.post).click()
  await tick()
  expect(secondOpen).toHaveBeenCalledOnce()
})

test("does not use an existing open menu", async () => {
  const { post, trigger } = addPost()
  const action = showMenu(trigger)
  const open = vi.fn()
  trigger.addEventListener("click", open)
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick()

  expect(open).not.toHaveBeenCalled()
  expect(action.click).not.toHaveBeenCalled()
  expect(document.getElementById("threads-saved-button-status")?.textContent).toBe(
    "Close the open menu and try again.",
  )
})

test("regression: leaves a sole visible menu without ownership untouched", async () => {
  const stale = showMenu(document.createElement("div"))
  stale.menu.hidden = true
  const { post, trigger } = addPost()
  let current
  trigger.addEventListener("click", () => {
    current = showMenu(trigger, "Save", false)
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick()

  expect(stale.click).not.toHaveBeenCalled()
  expect(current?.click).not.toHaveBeenCalled()
  await tick(2600)
  expect(current?.click).not.toHaveBeenCalled()
  expect(current?.menu.isConnected).toBe(true)
  expect(injected(post).disabled).toBe(false)
  expect(document.getElementById("threads-saved-button-status")?.textContent).toContain(
    "Save action unavailable",
  )
})

test("does not click an unrelated newly opened menu", async () => {
  const { post, trigger } = addPost()
  let unrelated
  trigger.addEventListener("click", () => {
    trigger.setAttribute("aria-expanded", "true")
    trigger.setAttribute("aria-controls", "expected-menu")
    unrelated = showMenu(document.createElement("div"))
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick(2600)

  expect(unrelated?.click).not.toHaveBeenCalled()
  expect(injected(post).disabled).toBe(false)
})

test.each(["Save image", "Guardar", "Report"])(
  "leaves an unsupported %s action untouched",
  async (label) => {
    const { post, trigger } = addPost()
    let action
    trigger.addEventListener("click", () => {
      action = showMenu(trigger, label)
    })
    stop = startThreadsSavedButton()
    injected(post).click()
    await tick(2600)

    expect(action?.click).not.toHaveBeenCalled()
    expect(document.getElementById("threads-saved-button-status")?.textContent).toContain(
      "Save action unavailable",
    )
    expect(action?.menu.isConnected).toBe(true)
  },
)

test("does not click disabled native actions", async () => {
  const { post, trigger } = addPost()
  let action
  trigger.addEventListener("click", () => {
    action = showMenu(trigger)
    action.item.setAttribute("aria-disabled", "true")
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick(2600)
  expect(action?.click).not.toHaveBeenCalled()
})

test("does not choose between ambiguous save actions", async () => {
  const { post, trigger } = addPost()
  let action
  trigger.addEventListener("click", () => {
    action = showMenu(trigger)
    const other = action.item.cloneNode(true)
    other.textContent = "Unsave"
    action.menu.append(other)
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick(2600)
  expect(action?.click).not.toHaveBeenCalled()
})

test.each(["pointerdown", "keydown"])("cancels pending dispatch on user %s", async (type) => {
  const { post, trigger } = addPost()
  let action
  trigger.addEventListener("click", () => {
    window.setTimeout(() => {
      action = showMenu(trigger)
    }, 100)
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  document.dispatchEvent(new Event(type, { bubbles: true }))
  await tick(200)

  expect(action?.click).not.toHaveBeenCalled()
  expect(injected(post).disabled).toBe(false)
})

test("cancels if the native menu closes before its action loads", async () => {
  const { post, trigger } = addPost()
  let action
  trigger.addEventListener("click", () => {
    action = showMenu(trigger, "")
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  trigger.setAttribute("aria-expanded", "false")
  if (action) action.item.textContent = "Save"
  await tick()
  expect(action?.click).not.toHaveBeenCalled()
})

test("cancels on a client-side route change", async () => {
  const { post, trigger } = addPost()
  let action
  trigger.addEventListener("click", () => {
    window.setTimeout(() => {
      action = showMenu(trigger)
    }, 100)
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  history.pushState(null, "", "/@example")
  await tick(200)
  expect(action?.click).not.toHaveBeenCalled()
})

test("cancels if its post is removed while waiting for a menu", async () => {
  const { post, trigger } = addPost()
  let action
  trigger.addEventListener("click", () => {
    window.setTimeout(() => {
      action = showMenu(trigger)
    }, 100)
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  post.remove()
  await tick(200)
  expect(action?.click).not.toHaveBeenCalled()
})

test("rechecks the native menu immediately before dispatch", async () => {
  const { post, trigger } = addPost()
  let action
  trigger.addEventListener("click", () => {
    action = showMenu(trigger)
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  // The menu can close after the promise resolves, but before its continuation runs.
  trigger.setAttribute("aria-expanded", "false")
  await tick()
  expect(action?.click).not.toHaveBeenCalled()
})

test("times out safely when Threads does not open a save menu", async () => {
  const { post } = addPost()
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick(2600)
  expect(injected(post).disabled).toBe(false)
  expect(document.getElementById("threads-saved-button-status")?.textContent).toContain(
    "Check the native post menu or sign in.",
  )
})

test("finds the action row when the timestamp is in the post footer", () => {
  const { post } = addPost()
  const footer = document.createElement("footer")
  footer.append(post.querySelector("a"))
  post.append(footer)
  stop = startThreadsSavedButton()
  expect(injected(post).previousElementSibling).toBe(post.querySelector(".share-action"))
})

test("keeps a detail post with a footer timestamp separate from its replies", async () => {
  history.replaceState(null, "", "/@example/post/detail")
  setPagePosts([
    { code: "detail", has_viewer_saved: true },
    { code: "reply", has_viewer_saved: false },
  ])
  const detail = addPost("detail")
  const reply = addPost("reply")
  const footer = document.createElement("footer")
  footer.append(detail.post.querySelector("a"))
  detail.post.append(footer)
  const detailMenu = vi.fn(() => showMenu(detail.trigger, "Unsave"))
  const replyMenu = vi.fn(() => showMenu(reply.trigger, "Save"))
  detail.trigger.addEventListener("click", detailMenu)
  reply.trigger.addEventListener("click", replyMenu)
  stop = startThreadsSavedButton()

  expectSaved(detail.post, true)
  expectSaved(reply.post, false)
  injected(detail.post).click()
  await tick()
  expect(detailMenu).toHaveBeenCalledOnce()
  expect(replyMenu).not.toHaveBeenCalled()
  expectSaved(detail.post, false)
  expectSaved(reply.post, false)
})

test.each(["header", "body"])(
  "does not mistake an unrelated %s popup for another post",
  async (where) => {
    const { post, trigger } = addPost()
    const popup = document.createElement("button")
    popup.type = "button"
    popup.setAttribute("aria-haspopup", "menu")
    popup.setAttribute("aria-expanded", "false")
    popup.innerHTML = '<svg aria-label="View edit history"></svg>'
    const postMenu = vi.fn(() => showMenu(trigger))
    const unrelatedMenu = vi.fn()
    trigger.addEventListener("click", postMenu)
    popup.addEventListener("click", unrelatedMenu)
    if (where === "header") post.firstElementChild.append(popup)
    else post.insertBefore(popup, post.querySelector(".post-actions"))
    stop = startThreadsSavedButton()
    expect(post.querySelectorAll(BUTTON)).toHaveLength(1)
    expect(injected(post).previousElementSibling).toBe(post.querySelector(".share-action"))
    injected(post).click()
    await tick()
    expect(postMenu).toHaveBeenCalledOnce()
    expect(unrelatedMenu).not.toHaveBeenCalled()
  },
)

test.each(["trigger", "header", "share"])(
  "handles extra %s wrappers without an ancestor cutoff",
  (part) => {
    const { post, trigger } = addPost()
    const nodes = {
      trigger,
      header: post.firstElementChild,
      share: post.querySelector(".share-action button"),
    }
    let node = nodes[part]
    for (let index = 0; index < 8; index++) {
      const wrapper = document.createElement("div")
      node.replaceWith(wrapper)
      wrapper.append(node)
      node = wrapper
    }
    stop = startThreadsSavedButton()
    expect(injected(post).previousElementSibling).toBe(post.querySelector(".share-action"))
  },
)

test("does not assign the page URL to a timestamp-less post or its reply", () => {
  history.replaceState(null, "", "/@example/post/detail")
  setPagePosts([
    { code: "detail", has_viewer_saved: true },
    { code: "reply", has_viewer_saved: false },
  ])
  const detail = addPost("detail")
  const reply = addPost("reply")
  const link = detail.post.querySelector("a")
  link.replaceWith(...link.childNodes)
  const feed = document.createElement("main")
  feed.append(detail.post, reply.post)
  document.body.append(feed)
  stop = startThreadsSavedButton()
  expect(detail.post.querySelector(BUTTON)).toBeNull()
  expectSaved(reply.post, false)
})

test.each([true, false])("initializes saved state %s from Threads page data", (saved) => {
  setPagePosts([{ code: "first", has_viewer_saved: saved }])
  const { post } = addPost()
  stop = startThreadsSavedButton()
  expectSaved(post, saved)
})

test.each([null, undefined, "true", 0])(
  "does not treat unavailable flag %s as unsaved",
  (saved) => {
    setPagePosts([{ code: "first", has_viewer_saved: saved }])
    const { post } = addPost()
    stop = startThreadsSavedButton()
    expectSaved(post, undefined)
  },
)

test("does not read saved flags from a post caption or a different post", () => {
  setPagePosts([
    { code: "different", has_viewer_saved: true },
    { code: "first", caption: JSON.stringify({ code: "first", has_viewer_saved: true }) },
  ])
  const { post } = addPost()
  stop = startThreadsSavedButton()
  expectSaved(post, undefined)
})

test("handles malformed and subsequently updated page data", async () => {
  const data = document.createElement("script")
  data.type = "application/json"
  data.textContent = '{"has_viewer_saved":'
  document.head.append(data)
  const { post } = addPost()
  stop = startThreadsSavedButton()
  expectSaved(post, undefined)

  data.textContent = JSON.stringify({ data: { code: "first", has_viewer_saved: true } })
  await tick()
  expectSaved(post, true)

  data.firstChild.data = JSON.stringify({ data: { code: "first", has_viewer_saved: false } })
  await tick()
  expectSaved(post, false)
})

test("applies data that arrives after a post and restores state after action-row replacement", async () => {
  const { post } = addPost()
  stop = startThreadsSavedButton()
  expectSaved(post, undefined)
  setPagePosts([{ code: "first", has_viewer_saved: true }])
  await tick()
  expectSaved(post, true)

  const row = post.querySelector(".post-actions")
  const replacement = row.cloneNode(true)
  replacement.querySelector(BUTTON).remove()
  row.replaceWith(replacement)
  await tick()
  expect(post.querySelectorAll(BUTTON)).toHaveLength(1)
  expectSaved(post, true)
})

test("updates duplicate copies of the same saved post without changing other posts", async () => {
  const first = addPost()
  const duplicate = addPost()
  const other = addPost("other")
  first.trigger.addEventListener("click", () => showMenu(first.trigger))
  stop = startThreadsSavedButton()

  injected(first.post).click()
  await tick()
  expectSaved(first.post, true)
  expectSaved(duplicate.post, true)
  expectSaved(other.post, undefined)
  for (const { post } of [first, duplicate, other]) {
    expect(injected(post).previousElementSibling).toBe(post.querySelector(".share-action"))
  }
})

test("does not restore a stale page snapshot after a toggle, but accepts new page data", async () => {
  setPagePosts([{ code: "first", has_viewer_saved: false }])
  const { post, trigger } = addPost()
  trigger.addEventListener("click", () => showMenu(trigger))
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick()
  expectSaved(post, true)

  document.body.append(document.createElement("div"))
  await tick()
  expectSaved(post, true)

  setPagePosts([{ code: "first", has_viewer_saved: false }])
  await tick()
  expectSaved(post, false)
})

test("reads the state when the native menu is opened and tracks native unsave", async () => {
  const { post, trigger } = addPost()
  let action
  trigger.addEventListener("click", () => {
    action = showMenu(trigger, "Unsave")
  })
  stop = startThreadsSavedButton()
  trigger.click()
  await tick()
  expectSaved(post, true)

  action.item.click()
  await tick()
  expectSaved(post, false)
})

test("corrects optimistic state if the native menu later reports a failed save", async () => {
  const { post, trigger } = addPost()
  trigger.addEventListener("click", () => showMenu(trigger, "Save"))
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick()
  expectSaved(post, true)

  trigger.click()
  await tick()
  expectSaved(post, false)
})

test("does not reuse another post's saved state when a DOM node is recycled", async () => {
  setPagePosts([
    { code: "first", has_viewer_saved: true },
    { code: "second", has_viewer_saved: false },
  ])
  const { post } = addPost()
  stop = startThreadsSavedButton()
  expectSaved(post, true)

  post.querySelector("a").href = "/@example/post/second"
  await tick()
  expectSaved(post, false)

  post.querySelector("a").href = "/@example/post/unknown"
  await tick()
  expectSaved(post, undefined)
})

test("does not dispatch a pending action after its post identity changes", async () => {
  const { post, trigger } = addPost()
  let action
  trigger.addEventListener("click", () => {
    window.setTimeout(() => {
      action = showMenu(trigger)
    }, 100)
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  post.querySelector("a").href = "/@example/post/recycled"
  await tick(200)
  expect(action.click).not.toHaveBeenCalled()
  expectSaved(post, undefined)
})

test("clears observed state across client-side navigation", async () => {
  setPagePosts([{ code: "first", has_viewer_saved: true }])
  const { post } = addPost()
  stop = startThreadsSavedButton()
  expectSaved(post, true)
  history.pushState(null, "", "/@another-view")
  document.body.append(document.createElement("div"))
  await tick()
  expectSaved(post, undefined)
})

test("waits for the action row instead of falling back to the header", async () => {
  const { post } = addPost()
  const row = post.querySelector(".post-actions")
  row.remove()
  stop = startThreadsSavedButton()
  expect(post.querySelector(BUTTON)).toBeNull()

  post.append(row)
  await tick()
  expect(injected(post).parentElement).toBe(row)
})

test("supports translated Share icon labels and wrappers", () => {
  const { post } = addPost()
  post.querySelector(".share-action svg").setAttribute("title", "分享")
  stop = startThreadsSavedButton()
  expect(injected(post).previousElementSibling).toBe(post.querySelector(".share-action"))
})

test("does not put an outer post's shortcut beside a quoted post's Share control", () => {
  const outer = addPost("outer")
  const quoted = addPost("quoted")
  outer.post.insertBefore(quoted.post, outer.post.querySelector(".post-actions"))
  stop = startThreadsSavedButton()
  expect(outer.post.querySelector(":scope > .post-actions").querySelector(BUTTON)).toBeNull()
  expect(injected(quoted.post).parentElement).toBe(quoted.post.querySelector(".post-actions"))
})

test("does not probe menus, fetch APIs, or persist state while reading page flags", () => {
  setPagePosts([{ code: "first", has_viewer_saved: true }])
  const { post, trigger } = addPost()
  const click = vi.fn()
  trigger.addEventListener("click", click)
  const fetch = vi.spyOn(globalThis, "fetch")
  const storage = vi.spyOn(Storage.prototype, "setItem")
  stop = startThreadsSavedButton()
  expectSaved(post, true)
  expect(click).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  expect(storage).not.toHaveBeenCalled()
})

test("regression: ignores Like counter updates without full scans or JSON reparsing", async () => {
  setPagePosts([{ code: "first", has_viewer_saved: true }])
  const { post } = addPost()
  stop = startThreadsSavedButton()
  await tick(120)
  const query = vi.spyOn(document, "querySelectorAll")
  const parse = vi.spyOn(JSON, "parse")

  post.querySelector(".post-actions span").firstChild.data = "101"
  await tick(120)

  expect(query.mock.calls.filter(([selector]) => selector.includes("aria-haspopup"))).toHaveLength(
    0,
  )
  expect(
    query.mock.calls.filter(([selector]) => selector.includes("application/json")),
  ).toHaveLength(0)
  expect(parse).not.toHaveBeenCalled()
})

test("regression: synchronizes an existing native menu shown only with hidden=false", async () => {
  const { post, trigger } = addPost()
  const action = showMenu(trigger, "Unsave")
  action.menu.hidden = true
  stop = startThreadsSavedButton()
  await tick(120)
  expectSaved(post, undefined)

  action.menu.hidden = false
  await tick()
  expectSaved(post, true)
  expect(action.click).not.toHaveBeenCalled()
})

test("regression: supports a Share aria-label on the button alone", () => {
  const { post } = addPost()
  post.querySelector(".share-action svg").removeAttribute("title")
  post.querySelector(".share-action button").setAttribute("aria-label", "Share")
  stop = startThreadsSavedButton()
  expect(injected(post).previousElementSibling).toBe(post.querySelector(".share-action"))
})

test("regression: pushState clears state without a DOM mutation", async () => {
  setPagePosts([{ code: "first", has_viewer_saved: true }])
  const { post } = addPost()
  stop = startThreadsSavedButton()
  await tick(120)
  expectSaved(post, true)

  history.pushState(null, "", "/@another-view")
  await tick()
  expectSaved(post, undefined)
})

test("regression: a retained button cannot open a native menu after cleanup", async () => {
  const { post, trigger } = addPost()
  const open = vi.fn(() => showMenu(trigger))
  trigger.addEventListener("click", open)
  stop = startThreadsSavedButton()
  const button = injected(post)
  stop()
  await tick()

  button.click()
  await tick()
  expect(open).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

test("accepts an explicitly owned container with one menu among unrelated portal menus", async () => {
  const { post, trigger } = addPost()
  let owned
  let unrelated
  trigger.addEventListener("click", () => {
    owned = showMenu(trigger)
    unrelated = showMenu(document.createElement("div"), "Unsave")
    const container = document.createElement("div")
    container.id = "owned-container"
    document.body.append(container)
    container.append(owned.menu)
    trigger.setAttribute("aria-controls", container.id)
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick()
  expect(owned.click).toHaveBeenCalledOnce()
  expect(unrelated.click).not.toHaveBeenCalled()
})

test("deduplicates repeated IDREF tokens for the same menu", async () => {
  const { post, trigger } = addPost()
  let action
  trigger.addEventListener("click", () => {
    action = showMenu(trigger)
    trigger.setAttribute("aria-controls", `${action.menu.id} ${action.menu.id}`)
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick()
  expect(action.click).toHaveBeenCalledOnce()
})

test.each(["duplicate-id", "missing-idref", "two-menus", "two-owners"])(
  "rejects ambiguous or incomplete menu ownership: %s",
  async (kind) => {
    const { post, trigger } = addPost()
    let action
    let other
    trigger.addEventListener("click", () => {
      action = showMenu(trigger)
      if (kind === "missing-idref") {
        trigger.setAttribute("aria-controls", `${action.menu.id} missing-menu`)
      } else if (kind === "duplicate-id") {
        const duplicate = document.createElement("div")
        duplicate.id = action.menu.id
        document.body.append(duplicate)
      } else {
        other = showMenu(document.createElement("div"), "Unsave")
        if (kind === "two-owners") {
          trigger.setAttribute("aria-controls", `${action.menu.id} ${other.menu.id}`)
        } else {
          const owner = document.createElement("div")
          owner.id = "ambiguous-owner"
          document.body.append(owner)
          owner.append(action.menu, other.menu)
          trigger.setAttribute("aria-controls", owner.id)
        }
      }
    })
    stop = startThreadsSavedButton()
    injected(post).click()
    await tick(2600)
    expect(action.click).not.toHaveBeenCalled()
    if (other) expect(other.click).not.toHaveBeenCalled()
    expect(action.menu.isConnected).toBe(true)
    expect(injected(post).disabled).toBe(false)
  },
)

test("waits for explicit delayed ownership without clicking an unowned menu", async () => {
  const { post, trigger } = addPost()
  let action
  trigger.addEventListener("click", () => {
    action = showMenu(trigger, "Save", false)
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick(100)
  expect(action.click).not.toHaveBeenCalled()
  trigger.setAttribute("aria-controls", action.menu.id)
  await tick()
  expect(action.click).toHaveBeenCalledOnce()
})

test("does not observe an unrelated unowned menu as saved evidence", async () => {
  const { post, trigger } = addPost()
  stop = startThreadsSavedButton()
  const action = showMenu(trigger, "Unsave", false)
  await tick()
  expectSaved(post, undefined)
  action.item.click()
  await tick()
  expectSaved(post, undefined)
})

test.each(["ownership", "disabled", "hidden"])(
  "rechecks %s after a menu wait resolves but before dispatch",
  async (change) => {
    const { post, trigger } = addPost()
    let action
    trigger.addEventListener("click", () => {
      action = showMenu(trigger)
    })
    stop = startThreadsSavedButton()
    injected(post).click()
    if (change === "ownership") trigger.setAttribute("aria-controls", "another-menu")
    if (change === "disabled") action.item.setAttribute("aria-disabled", "true")
    if (change === "hidden") action.menu.hidden = true
    await tick()
    expect(action.click).not.toHaveBeenCalled()
  },
)

test.each(["replaceState", "popstate", "hashchange"])(
  "clears route state on %s without unrelated DOM changes or snapshot replay",
  async (kind) => {
    setPagePosts([{ code: "first", has_viewer_saved: true }])
    const { post } = addPost()
    stop = startThreadsSavedButton()
    await tick(120)
    if (kind === "replaceState") history.replaceState(null, "", "/@replacement")
    else {
      // Simulate the browser URL update separately from its navigation event.
      const nativeReplace = Object.getPrototypeOf(history).replaceState
      nativeReplace.call(history, null, "", kind === "hashchange" ? "/#new" : "/@back")
      window.dispatchEvent(new Event(kind))
    }
    await tick()
    expectSaved(post, undefined)
    setPagePosts([{ code: "first", has_viewer_saved: false }])
    await tick()
    expectSaved(post, false)
  },
)

test.each(["pushState", "replaceState"])(
  "preserves %s receiver, arguments, result, and exceptions and restores ownership",
  (method) => {
    const result = { native: true }
    const error = new Error("native history failure")
    const native = vi.spyOn(history, method).mockImplementation((...args) => {
      if (args[0] === "throw") throw error
      return result
    })
    stop = startThreadsSavedButton()
    const data = { route: 1 }
    expect(history[method](data, "title", "/route")).toBe(result)
    expect(native).toHaveBeenLastCalledWith(data, "title", "/route")
    expect(native.mock.contexts.at(-1)).toBe(history)
    const receiver = {}
    expect(history[method].call(receiver, data, "other", "/other")).toBe(result)
    expect(native.mock.contexts.at(-1)).toBe(receiver)
    let caught
    try {
      history[method]("throw", "", "/fail")
    } catch (failure) {
      caught = failure
    }
    expect(caught).toBe(error)
    stop()
    expect(history[method]).toBe(native)
  },
)

test.each(["pushState", "replaceState"])(
  "keeps later %s wrappers and makes retained script wrappers inert after cleanup",
  async (method) => {
    const original = history[method]
    const { post } = addPost()
    stop = startThreadsSavedButton()
    const retained = history[method]
    const later = vi.fn(function (...args) {
      return retained.apply(this, args)
    })
    history[method] = later
    stop()
    expect(history[method]).toBe(later)
    const query = vi.spyOn(document, "querySelectorAll")
    try {
      history[method](null, "", "/@after-cleanup")
      retained.call(history, null, "", "/@retained")
      await tick()
      expect(later).toHaveBeenCalledOnce()
      expect(query).not.toHaveBeenCalled()
      expect(post.querySelector(BUTTON)).toBeNull()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      history[method] = original
    }
  },
)

test("repeated startup and idempotent cleanup leave no pending work", async () => {
  const { post } = addPost()
  const push = history.pushState
  const replace = history.replaceState
  for (let index = 0; index < 3; index++) {
    stop = startThreadsSavedButton()
    const button = injected(post)
    button.click()
    stop()
    stop()
    await tick()
    button.click()
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    window.dispatchEvent(new Event("popstate"))
    expect(vi.getTimerCount()).toBe(0)
    expect(history.pushState).toBe(push)
    expect(history.replaceState).toBe(replace)
  }
})

test("replacing an action row cancels its pending operation and retires the old button", async () => {
  const { post, trigger } = addPost()
  let action
  const open = vi.fn(() => {
    action = showMenu(trigger, "")
  })
  trigger.addEventListener("click", open)
  stop = startThreadsSavedButton()
  const oldButton = injected(post)
  oldButton.click()
  const row = post.querySelector(".post-actions")
  const replacement = row.cloneNode(true)
  replacement.querySelector(BUTTON).remove()
  row.replaceWith(replacement)
  await tick()
  expect(injected(post)).not.toBe(oldButton)
  action.item.textContent = "Save"
  await tick()
  expect(action.click).not.toHaveBeenCalled()
  oldButton.click()
  await tick()
  expect(open).toHaveBeenCalledOnce()
  expect(injected(post).disabled).toBe(false)
})

test("old operation completion cannot clear or dispatch a newer operation", async () => {
  const first = addPost("first")
  const second = addPost("second")
  let oldAction
  let nextAction
  first.trigger.addEventListener("click", () => {
    oldAction = showMenu(first.trigger, "")
  })
  second.trigger.addEventListener("click", () => {
    nextAction = showMenu(second.trigger, "")
  })
  stop = startThreadsSavedButton()
  injected(first.post).click()
  // Abort synchronously, then start the next generation before the old finally runs.
  history.pushState(null, "", "/@next")
  oldAction.menu.remove()
  first.trigger.setAttribute("aria-expanded", "false")
  injected(second.post).click()
  expect(nextAction).toBeDefined()
  await tick()
  expect(injected(second.post).disabled).toBe(true)
  injected(first.post).click()
  nextAction.item.textContent = "Save"
  await tick()
  expect(oldAction.click).not.toHaveBeenCalled()
  expect(nextAction.click).toHaveBeenCalledOnce()
  expect(injected(second.post).disabled).toBe(false)
})

test.each(["Share", "Share post", "分享", "分享貼文", "分享帖子"])(
  "supports explicit Share control label %s on buttons and role-buttons",
  (label) => {
    const native = addPost("native")
    const role = addPost("role")
    for (const { post } of [native, role]) {
      const control = post.querySelector(".share-action button")
      control.setAttribute("aria-label", label)
      control.querySelector("svg").removeAttribute("title")
      if (post === role.post) {
        const replacement = document.createElement("div")
        replacement.setAttribute("role", "button")
        replacement.setAttribute("aria-label", label)
        replacement.append(...control.childNodes)
        control.replaceWith(replacement)
      }
    }
    stop = startThreadsSavedButton()
    for (const { post } of [native, role]) {
      expect(injected(post).previousElementSibling).toBe(post.querySelector(".share-action"))
    }
  },
)

test("deduplicates multiple Share SVGs within one control and ignores numeric counters", () => {
  const { post } = addPost()
  const control = post.querySelector(".share-action button")
  control.prepend(control.querySelector("svg").cloneNode(true))
  stop = startThreadsSavedButton()
  expect(post.querySelectorAll(BUTTON)).toHaveLength(1)
  expect(injected(post).previousElementSibling).toBe(post.querySelector(".share-action"))
})

test.each(["Share image", "Reshare", "Guardar"])(
  "does not override unsupported explicit Share control label %s with an icon guess",
  (label) => {
    const { post } = addPost()
    post.querySelector(".share-action button").setAttribute("aria-label", label)
    stop = startThreadsSavedButton()
    expect(post.querySelector(BUTTON)).toBeNull()
  },
)

test("rejects two distinct Share controls in the same action scope", () => {
  const { post } = addPost()
  const share = post.querySelector(".share-action")
  share.after(share.cloneNode(true))
  stop = startThreadsSavedButton()
  expect(post.querySelector(BUTTON)).toBeNull()
})

test("discovers a delayed Share control label without scanning unrelated posts", async () => {
  const first = addPost()
  const other = addPost("other")
  const share = first.post.querySelector(".share-action button")
  share.querySelector("svg").removeAttribute("title")
  stop = startThreadsSavedButton()
  await tick(120)
  expect(first.post.querySelector(BUTTON)).toBeNull()
  const unrelated = vi.spyOn(other.post, "querySelectorAll")
  const query = vi.spyOn(document, "querySelectorAll")
  share.setAttribute("aria-label", "Share")
  await tick()
  expect(injected(first.post).previousElementSibling).toBe(
    first.post.querySelector(".share-action"),
  )
  expect(unrelated).not.toHaveBeenCalled()
  expect(query.mock.calls.filter(([selector]) => selector.includes("aria-haspopup"))).toHaveLength(
    0,
  )
})

test("coalesces dirty-post mutations into one local scan per batch", async () => {
  const { post } = addPost()
  const other = addPost("other")
  stop = startThreadsSavedButton()
  await tick(120)
  const query = vi.spyOn(post, "querySelectorAll")
  const unrelated = vi.spyOn(other.post, "querySelectorAll")
  const share = post.querySelector(".share-action svg")
  share.setAttribute("title", "分享")
  await tick()
  const singleScan = query.mock.calls.map(([selector]) => selector)
  expect(singleScan.length).toBeGreaterThan(0)
  query.mockClear()

  share.setAttribute("title", "Share")
  share.setAttribute("title", "Share post")
  share.setAttribute("title", "分享貼文")
  await tick()
  expect(query.mock.calls.map(([selector]) => selector)).toEqual(singleScan)
  expect(unrelated).not.toHaveBeenCalled()
  expect(post.querySelectorAll(BUTTON)).toHaveLength(1)
})

test("ignores caption, global style, and script-owned UI mutations", async () => {
  const { post } = addPost()
  const caption = document.createElement("p")
  caption.textContent = "Caption"
  post.append(caption)
  stop = startThreadsSavedButton()
  await tick(120)
  const query = vi.spyOn(document, "querySelectorAll")
  const local = vi.spyOn(post, "querySelectorAll")
  caption.firstChild.data = "Updated caption"
  document.body.className = "new-theme"
  document.body.style.color = "red"
  injected(post).title = "Owned UI change"
  await tick(120)
  expect(query.mock.calls.filter(([selector]) => selector.includes("aria-haspopup"))).toHaveLength(
    0,
  )
  expect(
    query.mock.calls.filter(([selector]) => selector.includes("application/json")),
  ).toHaveLength(0)
  expect(local).not.toHaveBeenCalled()
})

test("a pending menu waiter ignores unrelated counter mutations", async () => {
  const { post, trigger } = addPost()
  let action
  trigger.addEventListener("click", () => {
    action = showMenu(trigger, "")
  })
  stop = startThreadsSavedButton()
  await tick(120)
  injected(post).click()
  await tick()
  const query = vi.spyOn(document, "querySelectorAll")
  const menuQuery = vi.spyOn(action.menu, "querySelectorAll")
  post.querySelector(".post-actions span").firstChild.data = "102"
  await tick()
  expect(query).not.toHaveBeenCalled()
  expect(menuQuery).not.toHaveBeenCalled()
  action.item.textContent = "Save"
  await tick()
  expect(action.click).toHaveBeenCalledOnce()
})

test.each(["hidden", "aria-hidden", "inert", "style", "class"])(
  "synchronizes an existing menu after its ancestor %s becomes visible",
  async (attribute) => {
    const { post, trigger } = addPost()
    const action = showMenu(trigger, "Unsave")
    const ancestor = document.createElement("div")
    document.body.append(ancestor)
    ancestor.append(action.menu)
    if (attribute === "class") {
      const style = document.createElement("style")
      style.textContent = ".hidden-native-menu { display: none }"
      document.head.append(style)
      ancestor.className = "hidden-native-menu"
    } else {
      ancestor.setAttribute(attribute, attribute === "style" ? "display: none" : "true")
    }
    stop = startThreadsSavedButton()
    await tick(120)
    expectSaved(post, undefined)
    const query = vi.spyOn(document, "querySelectorAll")
    ancestor.removeAttribute(attribute)
    await tick()
    expectSaved(post, true)
    expect(action.click).not.toHaveBeenCalled()
    expect(
      query.mock.calls.filter(([selector]) => selector.includes("aria-haspopup")),
    ).toHaveLength(0)
  },
)

test("synchronizes a disabled native action when it becomes enabled", async () => {
  const { post, trigger } = addPost()
  const action = showMenu(trigger, "Unsave")
  action.item.setAttribute("aria-disabled", "true")
  stop = startThreadsSavedButton()
  await tick(120)
  expectSaved(post, undefined)
  action.item.removeAttribute("aria-disabled")
  await tick()
  expectSaved(post, true)
  expect(action.click).not.toHaveBeenCalled()
})

test("processes new and changed head JSON locally without trigger discovery", async () => {
  const { post } = addPost()
  stop = startThreadsSavedButton()
  await tick(120)
  const query = vi.spyOn(document, "querySelectorAll")
  const parse = vi.spyOn(JSON, "parse")
  const data = setPagePosts([{ code: "first", has_viewer_saved: true }])
  await tick()
  expectSaved(post, true)
  expect(parse).toHaveBeenCalledTimes(1)
  data.firstChild.data = JSON.stringify({ code: "first", has_viewer_saved: false })
  await tick()
  expectSaved(post, false)
  expect(parse).toHaveBeenCalledTimes(2)
  expect(query.mock.calls.filter(([selector]) => selector.includes("aria-haspopup"))).toHaveLength(
    0,
  )
})

test.each(["main", "body"])("discovers posts after relevant %s root replacement", async (kind) => {
  const first = addPost()
  const main = document.createElement("main")
  document.body.append(main)
  main.append(first.post)
  stop = startThreadsSavedButton()
  await tick(120)
  const next = addPost("next")
  next.post.remove()
  const replacement = document.createElement(kind)
  replacement.append(next.post)
  if (kind === "main") main.replaceWith(replacement)
  else document.body.replaceWith(replacement)
  await tick()
  expect(injected(next.post).previousElementSibling).toBe(next.post.querySelector(".share-action"))
  expect(first.post.querySelector(BUTTON)).toBeNull()
})

test("observes JSON after head replacement", async () => {
  const { post } = addPost()
  stop = startThreadsSavedButton()
  await tick(120)
  const replacement = document.createElement("head")
  document.head.replaceWith(replacement)
  setPagePosts([{ code: "first", has_viewer_saved: true }])
  await tick()
  expectSaved(post, true)
})

test("retains exactly 500 detached states in addition to connected shortcuts", async () => {
  setPagePosts([
    { code: "pinned", has_viewer_saved: true },
    { code: "oldest", has_viewer_saved: true },
  ])
  const pinned = addPost("pinned")
  stop = startThreadsSavedButton()
  await tick(120)
  setPagePosts(
    Array.from({ length: 499 }, (_, index) => ({
      code: `detached-${index}`,
      has_viewer_saved: false,
    })),
  )
  await tick()
  const oldest = addPost("oldest")
  const recent = addPost("detached-498")
  await tick()
  expectSaved(pinned.post, true)
  expectSaved(oldest.post, true)
  expectSaved(recent.post, false)
})

test("evicts detached overflow without replaying consumed JSON and keeps connected copies pinned", async () => {
  const oldData = setPagePosts([{ code: "oldest", has_viewer_saved: true }])
  const first = addPost("pinned")
  const duplicate = addPost("pinned")
  setPagePosts([{ code: "pinned", has_viewer_saved: true }])
  stop = startThreadsSavedButton()
  await tick(120)
  setPagePosts(
    Array.from({ length: 500 }, (_, index) => ({
      code: `overflow-${index}`,
      has_viewer_saved: false,
    })),
  )
  await tick()
  const oldest = addPost("oldest")
  const recent = addPost("overflow-499")
  await tick()
  expectSaved(first.post, true)
  expectSaved(duplicate.post, true)
  expectSaved(recent.post, false)
  expectSaved(oldest.post, undefined)

  // A consumed script is not fresh evidence, even if reinserted after eviction.
  oldData.remove()
  document.head.append(oldData)
  await tick()
  expectSaved(oldest.post, undefined)

  const native = showMenu(oldest.trigger, "Unsave")
  await tick()
  expectSaved(oldest.post, true)
  expect(native.click).not.toHaveBeenCalled()
  native.menu.remove()
  oldest.trigger.setAttribute("aria-expanded", "false")

  oldData.textContent = JSON.stringify({ code: "oldest", has_viewer_saved: false })
  await tick()
  expectSaved(oldest.post, false)
  setPagePosts([{ code: "oldest", has_viewer_saved: true }])
  await tick()
  expectSaved(oldest.post, true)
})

test("uses access recency rather than insertion order for detached eviction", async () => {
  setPagePosts([{ code: "accessed", has_viewer_saved: true }])
  stop = startThreadsSavedButton()
  await tick(120)
  setPagePosts([{ code: "unaccessed", has_viewer_saved: false }])
  await tick()
  setPagePosts(
    Array.from({ length: 498 }, (_, index) => ({
      code: `lru-${index}`,
      has_viewer_saved: false,
    })),
  )
  await tick()
  const accessed = addPost("accessed")
  await tick()
  expectSaved(accessed.post, true)
  accessed.post.remove()
  await tick()
  setPagePosts([{ code: "newest", has_viewer_saved: true }])
  await tick()

  const restored = addPost("accessed")
  const evicted = addPost("unaccessed")
  const newest = addPost("newest")
  await tick()
  expectSaved(restored.post, true)
  expectSaved(evicted.post, undefined)
  expectSaved(newest.post, true)
})

test("a detached shortcut no longer pins saved state or dispatches native actions", async () => {
  setPagePosts([{ code: "detached", has_viewer_saved: true }])
  const { post, trigger } = addPost("detached")
  const open = vi.fn(() => showMenu(trigger))
  trigger.addEventListener("click", open)
  stop = startThreadsSavedButton()
  const retained = injected(post)
  post.remove()
  await tick()
  setPagePosts(
    Array.from({ length: 500 }, (_, index) => ({
      code: `replacement-${index}`,
      has_viewer_saved: false,
    })),
  )
  await tick()
  // Reconnect the old trigger, but not its retired shortcut registration.
  document.body.append(post)
  retained.click()
  await tick()
  expect(open).not.toHaveBeenCalled()
  expect(injected(post)).not.toBe(retained)
  expectSaved(post, undefined)
})

test.each(["pushState", "replaceState"])(
  "does not clear saved state when %s leaves the URL unchanged",
  async (method) => {
    setPagePosts([{ code: "first", has_viewer_saved: true }])
    const { post } = addPost()
    stop = startThreadsSavedButton()
    await tick(120)
    history[method]({ stateOnly: true }, "", location.href)
    await tick()
    expectSaved(post, true)
  },
)

test("route changes cancel the native wait immediately without later DOM mutations", async () => {
  const { post, trigger } = addPost()
  const open = vi.fn()
  trigger.addEventListener("click", open)
  stop = startThreadsSavedButton()
  await tick(120)
  const button = injected(post)
  button.click()
  expect(open).toHaveBeenCalledOnce()
  history.pushState(null, "", "/@cancel-pending")
  await tick()
  expect(button.disabled).toBe(false)
  expect(button.hasAttribute("aria-busy")).toBe(false)
  const action = showMenu(trigger)
  await tick()
  expect(action.click).not.toHaveBeenCalled()
})

test("ignores counter child replacement as well as text-node updates", async () => {
  const { post } = addPost()
  stop = startThreadsSavedButton()
  await tick(120)
  const query = vi.spyOn(document, "querySelectorAll")
  const local = vi.spyOn(post, "querySelectorAll")
  post.querySelector(".post-actions span").textContent = "104"
  await tick(120)
  expect(query).not.toHaveBeenCalled()
  expect(local).not.toHaveBeenCalled()
})

test("retires a removed post's shortcut without a later data or layout mutation", async () => {
  setPagePosts([{ code: "first", has_viewer_saved: true }])
  const { post, trigger } = addPost()
  const open = vi.fn(() => showMenu(trigger))
  trigger.addEventListener("click", open)
  stop = startThreadsSavedButton()
  await tick(120)
  const retained = injected(post)
  post.remove()
  await tick()
  expect(post.querySelector(BUTTON)).toBeNull()
  document.body.append(post)
  await tick()
  expect(injected(post)).not.toBe(retained)
  expectSaved(post, true)
  post.querySelector(".post-actions").append(retained)
  retained.click()
  await tick()
  expect(open).not.toHaveBeenCalled()
})

test("discovers a delayed Share label through deep header wrappers", async () => {
  const { post } = addPost()
  let header = post.firstElementChild
  for (let index = 0; index < 8; index++) {
    const wrapper = document.createElement("div")
    header.replaceWith(wrapper)
    wrapper.append(header)
    header = wrapper
  }
  const share = post.querySelector(".share-action button")
  share.querySelector("svg").removeAttribute("title")
  stop = startThreadsSavedButton()
  expect(post.querySelector(BUTTON)).toBeNull()
  share.setAttribute("aria-label", "Share")
  await tick()
  expect(injected(post).previousElementSibling).toBe(post.querySelector(".share-action"))
})

test.each(["pushState", "replaceState"])(
  "does not start a partial instance when %s cannot be wrapped",
  async (method) => {
    const { post } = addPost()
    const descriptor = Object.getOwnPropertyDescriptor(history, method)
    const original = history[method]
    const push = history.pushState
    Object.defineProperty(history, method, { configurable: true, writable: false, value: original })
    try {
      stop = startThreadsSavedButton()
      expect(post.querySelector(BUTTON)).toBeNull()
      expect(document.getElementById("threads-saved-button-style")).toBeNull()
      expect(history.pushState).toBe(push)
      post.querySelector("a").href = "/@example/post/another"
      await tick()
      expect(vi.getTimerCount()).toBe(0)
      expect(post.querySelector(BUTTON)).toBeNull()
    } finally {
      if (descriptor) Object.defineProperty(history, method, descriptor)
      else Reflect.deleteProperty(history, method)
    }
  },
)

test("cleanup still removes UI and timers if a page locks a History wrapper", async () => {
  const { post } = addPost()
  const descriptor = Object.getOwnPropertyDescriptor(history, "pushState")
  stop = startThreadsSavedButton()
  const retained = history.pushState
  Object.defineProperty(history, "pushState", {
    configurable: true,
    writable: false,
    value: retained,
  })
  try {
    injected(post).click()
    expect(() => stop()).not.toThrow()
    retained.call(history, null, "", "/after-locked-cleanup")
    await tick()
    expect(vi.getTimerCount()).toBe(0)
    expect(post.querySelector(BUTTON)).toBeNull()
    expect(document.getElementById("threads-saved-button-status")).toBeNull()
  } finally {
    if (descriptor) Object.defineProperty(history, "pushState", descriptor)
    else Reflect.deleteProperty(history, "pushState")
  }
})

test("rejects a shared portal claimed by another expanded post trigger", async () => {
  const first = addPost("first")
  const other = addPost("other")
  let action
  first.trigger.addEventListener("click", () => {
    action = showMenu(first.trigger)
    other.trigger.setAttribute("aria-controls", action.menu.id)
    other.trigger.setAttribute("aria-expanded", "true")
  })
  stop = startThreadsSavedButton()
  injected(first.post).click()
  await tick(2600)
  expect(action.click).not.toHaveBeenCalled()
  expectSaved(first.post, undefined)
  expectSaved(other.post, undefined)
})

test("rejects a competing expanded owner inserted before the discovery batch", async () => {
  const first = addPost()
  let action
  first.trigger.addEventListener("click", () => {
    const other = addPost("new-owner")
    action = showMenu(first.trigger)
    other.trigger.setAttribute("aria-controls", action.menu.id)
    other.trigger.setAttribute("aria-expanded", "true")
  })
  stop = startThreadsSavedButton()
  injected(first.post).click()
  await tick(2600)
  expect(action.click).not.toHaveBeenCalled()
  expectSaved(first.post, undefined)
})

test.each(["adjacent", "quoted"])(
  "never borrows an action row from a %s post without its own More menu",
  async (kind) => {
    const first = addPost("first")
    const other = addPost("other")
    const row = first.post.querySelector(".post-actions")
    row.remove()
    other.trigger.remove()
    if (kind === "quoted") first.post.append(other.post)
    else {
      const feed = document.createElement("main")
      feed.append(first.post, other.post)
      document.body.append(feed)
    }
    const open = vi.fn()
    first.trigger.addEventListener("click", open)
    stop = startThreadsSavedButton()
    expect(document.querySelectorAll(BUTTON)).toHaveLength(0)
    expect(open).not.toHaveBeenCalled()
    if (kind === "adjacent") {
      first.post.append(row)
      await tick()
      expect(injected(first.post).parentElement).toBe(row)
      expect(other.post.querySelector(BUTTON)).toBeNull()
    }
  },
)

test.each(["identity", "row", "post"])(
  "reserves incoming cached state before retiring an outgoing %s at capacity",
  async (kind) => {
    const first = addPost("old")
    setPagePosts([
      { code: "old", has_viewer_saved: false },
      { code: "incoming", has_viewer_saved: true },
    ])
    stop = startThreadsSavedButton()
    await tick()
    setPagePosts(
      Array.from({ length: 499 }, (_, index) => ({
        code: `cached-${index}`,
        has_viewer_saved: false,
      })),
    )
    await tick()
    let incoming = first.post
    if (kind === "post") {
      const next = addPost("incoming")
      first.post.remove()
      incoming = next.post
    } else {
      first.post.querySelector("a").href = "/@example/post/incoming"
      if (kind === "row") {
        const row = first.post.querySelector(".post-actions")
        const replacement = row.cloneNode(true)
        replacement.querySelector(BUTTON).remove()
        row.replaceWith(replacement)
      }
    }
    await tick()
    expectSaved(incoming, true)
    const old = addPost("old")
    await tick()
    expectSaved(old.post, false)
  },
)

test("a delayed label among many pending posts does not scan the shared feed", async () => {
  const feed = document.createElement("main")
  document.body.append(feed)
  const posts = Array.from({ length: 10 }, (_, index) => {
    const entry = addPost(`pending-${index}`)
    let header = entry.post.firstElementChild
    for (let depth = 0; depth < 3; depth++) {
      const wrapper = document.createElement("div")
      header.replaceWith(wrapper)
      wrapper.append(header)
      header = wrapper
    }
    entry.post.querySelector(".share-action svg").removeAttribute("title")
    feed.append(entry.post)
    return entry
  })
  stop = startThreadsSavedButton()
  await tick(120)
  const query = vi.spyOn(feed, "querySelectorAll")
  const others = posts.slice(1).map(({ post }) => vi.spyOn(post, "querySelectorAll"))
  posts[0].post.querySelector(".share-action button").setAttribute("aria-label", "Share")
  await tick()
  expect(injected(posts[0].post).previousElementSibling).toBe(
    posts[0].post.querySelector(".share-action"),
  )
  expect(query).not.toHaveBeenCalled()
  for (const other of others) expect(other).not.toHaveBeenCalled()
})

test("skips a malformed timestamp URL without stopping other post discovery", async () => {
  const broken = addPost("broken")
  const other = addPost("other")
  broken.post.querySelector("a").href = "http://[/post/broken"
  stop = startThreadsSavedButton()
  expect(broken.post.querySelector(BUTTON)).toBeNull()
  expect(injected(other.post)).toBeDefined()
  broken.post.querySelector("a").href = "/@example/post/repaired"
  await tick()
  expect(injected(broken.post)).toBeDefined()
})

test.each(['native"menu\\[1]', "原生選單😀"])(
  "resolves an explicit menu ID with CSS-significant characters: %s",
  async (id) => {
    const { post, trigger } = addPost()
    let action
    trigger.addEventListener("click", () => {
      action = showMenu(trigger)
      action.menu.id = id
      trigger.setAttribute("aria-controls", id)
    })
    stop = startThreadsSavedButton()
    injected(post).click()
    await tick()
    expect(action.click).toHaveBeenCalledOnce()
  },
)

test("restoring shortcut placement does not schedule an own-mutation refresh loop", async () => {
  const { post } = addPost()
  stop = startThreadsSavedButton()
  await tick(120)
  const button = injected(post)
  post.querySelector(".post-actions").prepend(button)
  await tick()
  expect(button.previousElementSibling).toBe(post.querySelector(".share-action"))
  expect(vi.getTimerCount()).toBe(0)
})

test("pins every incoming code before a batch of recycled posts can evict state", async () => {
  const first = addPost("old-first")
  const second = addPost("old-second")
  setPagePosts([
    { code: "old-first", has_viewer_saved: false },
    { code: "old-second", has_viewer_saved: false },
    { code: "incoming", has_viewer_saved: true },
  ])
  stop = startThreadsSavedButton()
  await tick()
  setPagePosts(
    Array.from({ length: 499 }, (_, index) => ({
      code: `batch-${index}`,
      has_viewer_saved: false,
    })),
  )
  await tick()
  first.post.querySelector("a").href = "/@example/post/uncached"
  second.post.querySelector("a").href = "/@example/post/incoming"
  await tick()
  expectSaved(first.post, undefined)
  expectSaved(second.post, true)
  const oldFirst = addPost("old-first")
  const oldSecond = addPost("old-second")
  await tick()
  expectSaved(oldFirst.post, false)
  expectSaved(oldSecond.post, false)
})

test.each(["route", "identity"])(
  "observed closure permits fresh keyboard-style menu evidence after %s change",
  async (kind) => {
    const { post, trigger } = addPost()
    stop = startThreadsSavedButton()
    const old = showMenu(trigger, "Unsave")
    await tick()
    expectSaved(post, true)
    old.menu.remove()
    trigger.setAttribute("aria-expanded", "false")
    await tick()
    if (kind === "route") history.pushState(null, "", "/next-native-view")
    else post.querySelector("a").href = "/@example/post/recycled-native"
    await tick()
    expectSaved(post, undefined)
    const fresh = showMenu(trigger, "Unsave")
    await tick()
    expectSaved(post, true)
    expect(fresh.click).not.toHaveBeenCalled()
  },
)

test.each(["route", "identity"])(
  "does not transfer a still-open menu's evidence across %s change",
  async (kind) => {
    const { post, trigger } = addPost()
    stop = startThreadsSavedButton()
    const old = showMenu(trigger, "Unsave")
    await tick()
    expectSaved(post, true)
    if (kind === "route") history.pushState(null, "", "/stale-native-view")
    else post.querySelector("a").href = "/@example/post/another-native"
    await tick()
    old.item.setAttribute("title", "Changed stale menu")
    await tick()
    expectSaved(post, undefined)
    expect(old.click).not.toHaveBeenCalled()
  },
)

test.each(["characterData", "childList"])(
  "handles delayed visible Share text via %s without broad label guesses",
  async (kind) => {
    const { post } = addPost()
    post.querySelector(".share-action svg").removeAttribute("title")
    const label = post.querySelector(".share-action span")
    label.textContent = "..."
    stop = startThreadsSavedButton()
    expect(post.querySelector(BUTTON)).toBeNull()
    if (kind === "characterData") label.firstChild.data = "Share"
    else label.textContent = "Share"
    await tick()
    expect(injected(post).previousElementSibling).toBe(post.querySelector(".share-action"))
    if (kind === "characterData") label.firstChild.data = "Share image"
    else label.textContent = "Share image"
    await tick()
    expect(post.querySelector(BUTTON)).toBeNull()
    label.firstChild.data = "分享"
    await tick()
    expect(injected(post)).toBeDefined()
  },
)

test("ignores Share count text changes even when its icon has a recognized label", async () => {
  const { post } = addPost()
  stop = startThreadsSavedButton()
  await tick(120)
  const local = vi.spyOn(post, "querySelectorAll")
  const query = vi.spyOn(document, "querySelectorAll")
  const counter = post.querySelector(".share-action span")
  counter.firstChild.data = "642"
  await tick()
  counter.textContent = "643"
  await tick()
  expect(local).not.toHaveBeenCalled()
  expect(query).not.toHaveBeenCalled()
})

test.each(["before-observer", "before-timer"])(
  "a shortcut click %s cannot evict another incoming post's cached state",
  async (when) => {
    const first = addPost("clicked-old")
    const second = addPost("next-old")
    first.trigger.addEventListener("click", () => showMenu(first.trigger))
    setPagePosts([
      { code: "clicked-old", has_viewer_saved: false },
      { code: "next-old", has_viewer_saved: false },
      { code: "next-cached", has_viewer_saved: true },
    ])
    stop = startThreadsSavedButton()
    await tick()
    setPagePosts(
      Array.from({ length: 499 }, (_, index) => ({
        code: `click-batch-${index}`,
        has_viewer_saved: false,
      })),
    )
    await tick()
    first.post.querySelector("a").href = "/@example/post/clicked-new"
    second.post.querySelector("a").href = "/@example/post/next-cached"
    if (when === "before-timer") await Promise.resolve()
    injected(first.post).click()
    await tick(120)
    expectSaved(first.post, true)
    expectSaved(second.post, true)
  },
)

test("removes injected UI, timers, and pending actions on cleanup", async () => {
  const { post } = addPost()
  stop = startThreadsSavedButton()
  injected(post).click()
  stop()
  await tick()
  document.body.append(document.createElement("div"))
  await tick()

  expect(document.querySelectorAll(BUTTON)).toHaveLength(0)
  expect(document.getElementById("threads-saved-button-style")).toBeNull()
  expect(document.getElementById("threads-saved-button-status")).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})
