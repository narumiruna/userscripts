// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { startThreadsSavedButton } from "../src/threads-saved-button/saved-button"

const BUTTON = "button.threads-saved-button"
let stop: () => void

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
  `
  document.body.append(post)
  return { post, trigger: post.querySelector<HTMLElement>('[aria-haspopup="menu"]') as HTMLElement }
}

function showMenu(trigger: HTMLElement, label = "Save", controlled = true) {
  const menu = document.createElement("div")
  menu.id = "native-post-menu"
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

function injected(post: HTMLElement): HTMLButtonElement {
  const button = post.querySelector<HTMLButtonElement>(BUTTON)
  if (!button) throw new Error("Expected an injected save button")
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
  // jsdom has no layout. Real visibility is also checked in the Chromium smoke test.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (
    this: HTMLElement,
  ) {
    for (let parent: HTMLElement | null = this; parent; parent = parent.parentElement) {
      if (parent.hidden || getComputedStyle(parent).display === "none") {
        return [] as unknown as DOMRectList
      }
    }
    return [new DOMRect(0, 0, 24, 24)] as unknown as DOMRectList
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

  expect(button.title).toBe("Save / unsave")
  expect(button.getAttribute("aria-label")).toBe("Save / unsave")
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
    let action: ReturnType<typeof showMenu> | undefined
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
    expect(button.hasAttribute("aria-pressed")).toBe(false)
    expect(button.title).toBe("Save / unsave")
    expect(document.getElementById("threads-saved-button-status")?.textContent).toContain(
      "Threads action requested:",
    )
  },
)

test.each(["button", "role-button"])("supports native %s menu controls", async (kind) => {
  const { post, trigger } = addPost()
  let click: ReturnType<typeof vi.fn> | undefined
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
  const actions: ReturnType<typeof showMenu>[] = []
  trigger.addEventListener("click", () => {
    actions.push(showMenu(trigger, actions.length === 0 ? "Unsave" : "Save"))
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick()

  const link = post.querySelector("a") as HTMLAnchorElement
  link.href = "/@example/post/recycled"
  injected(post).click()
  await tick()

  expect(actions).toHaveLength(2)
  for (const action of actions) expect(action.click).toHaveBeenCalledOnce()
})

test("waits for an asynchronously rendered native menu and its label", async () => {
  const { post, trigger } = addPost()
  let action: ReturnType<typeof showMenu> | undefined
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

test("ignores hidden stale menus when the trigger has no aria-controls", async () => {
  const stale = showMenu(document.createElement("div"))
  stale.menu.hidden = true
  const { post, trigger } = addPost()
  let current: ReturnType<typeof showMenu> | undefined
  trigger.addEventListener("click", () => {
    current = showMenu(trigger, "Save", false)
  })
  stop = startThreadsSavedButton()
  injected(post).click()
  await tick()

  expect(stale.click).not.toHaveBeenCalled()
  expect(current?.click).toHaveBeenCalledOnce()
})

test("does not click an unrelated newly opened menu", async () => {
  const { post, trigger } = addPost()
  let unrelated: ReturnType<typeof showMenu> | undefined
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
    let action: ReturnType<typeof showMenu> | undefined
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
  let action: ReturnType<typeof showMenu> | undefined
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
  let action: ReturnType<typeof showMenu> | undefined
  trigger.addEventListener("click", () => {
    action = showMenu(trigger)
    const other = action.item.cloneNode(true) as HTMLElement
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
  let action: ReturnType<typeof showMenu> | undefined
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
  let action: ReturnType<typeof showMenu> | undefined
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
  let action: ReturnType<typeof showMenu> | undefined
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
  let action: ReturnType<typeof showMenu> | undefined
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
  let action: ReturnType<typeof showMenu> | undefined
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
