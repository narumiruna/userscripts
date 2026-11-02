// ==UserScript==
// @name         PTT Auto Media
// @namespace    userscripts/ptt-auto-media
// @version      0.1.0
// @description  Display linked images, GIFs, and videos inline in PTT articles and comments.
// @match        https://www.ptt.cc/bbs/*/M.*.html
// @match        https://ptt.cc/bbs/*/M.*.html
// @downloadURL  https://raw.githubusercontent.com/narumiruna/userscripts/main/src/ptt-auto-media/ptt-auto-media.user.js
// @updateURL    https://raw.githubusercontent.com/narumiruna/userscripts/main/src/ptt-auto-media/ptt-auto-media.user.js
// @run-at       document-idle
// @grant        none
// @noframes
// @license      AGPL-3.0-only
// ==/UserScript==

// @ts-check

;(() => {
  // biome-ignore lint/suspicious/noRedundantUseStrict: Userscript managers run this as a classic script.
  "use strict"

  const PREFIX = "ptt-auto-media"
  const IMAGE = /\.(?:jpe?g|png|gif|webp|avif|bmp)$/i
  const VIDEO = /\.(?:mp4|webm|ogv|m4v)$/i
  const IMGUR = new Set(["imgur.com", "www.imgur.com", "m.imgur.com", "i.imgur.com"])
  const YOUTUBE = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
  ])

  /** @typedef {{kind: "image" | "video" | "youtube", src: string}} Media */
  /** @typedef {{href: string, media: Media, wrapper: HTMLElement, dispose: () => void}} Preview */

  /**
   * Convert only known media URLs. Do not fetch or scrape arbitrary link targets.
   * @param {string} href
   * @returns {Media | undefined}
   */
  function mediaOf(href) {
    let url
    try {
      url = new URL(href, document.baseURI)
    } catch {
      return
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return
    const host = url.hostname.replace(/\.$/, "")
    if (
      !host.includes(".") ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      /^[\d.]+$/.test(host) ||
      host.includes(":")
    )
      return
    url.protocol = "https:"
    url.hash = ""

    if (YOUTUBE.has(url.hostname)) {
      const id = url.hostname.endsWith("youtu.be")
        ? url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1]
        : url.pathname === "/watch"
          ? url.searchParams.get("v")
          : url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})\/?$/)?.[1]
      if (!id || !/^[\w-]{11}$/.test(id)) return
      return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` }
    }

    if (IMGUR.has(url.hostname)) {
      const match = url.pathname.match(
        /^\/([a-z0-9]{5,10})(?:\.(jpe?g|png|gif|webp|avif|gifv|mp4|webm))?\/?$/i,
      )
      if (!match) return
      const extension = match[2]?.toLowerCase() || "jpg"
      const type = extension === "gifv" ? "mp4" : extension
      return {
        kind: VIDEO.test(`.${type}`) ? "video" : "image",
        src: `https://i.imgur.com/${match[1]}.${type}`,
      }
    }

    if (url.hostname === "pbs.twimg.com" && url.pathname.startsWith("/media/")) {
      const format = url.searchParams.get("format")
      if (
        (format && IMAGE.test(`.${format}`)) ||
        /\.(?:jpe?g|png|webp)(?::\w+)?$/i.test(url.pathname)
      ) {
        return { kind: "image", src: url.href }
      }
    }
    if (IMAGE.test(url.pathname)) return { kind: "image", src: url.href }
    if (VIDEO.test(url.pathname)) return { kind: "video", src: url.href }
  }

  /**
   * Reuse a nearby native PTT embed, not an unrelated occurrence elsewhere in the article.
   * @param {HTMLAnchorElement} link
   * @param {Media} media
   */
  function hasNativeEmbed(link, media) {
    let sibling = (link.closest(".push") || link).nextElementSibling
    while (sibling?.matches(`.richcontent, .${PREFIX}`)) {
      if (sibling.classList.contains("richcontent")) {
        const matches = [
          ...sibling.querySelectorAll("img[src], video[src], video source[src], iframe[src]"),
        ].some((element) => {
          const native = mediaOf(element.getAttribute("src") || "")
          return native?.kind === media.kind && native.src === media.src
        })
        if (matches) return true
      }
      sibling = sibling.nextElementSibling
    }
    return false
  }

  /**
   * @param {HTMLAnchorElement} link
   * @param {Media} media
   * @returns {Preview}
   */
  function createPreview(link, media) {
    const wrapper = document.createElement("div")
    wrapper.className = PREFIX
    wrapper.dataset.state = "loading"
    const error = document.createElement("div")
    error.className = `${PREFIX}-error`
    error.setAttribute("role", "status")
    error.hidden = true
    error.append("Media unavailable. ")
    const original = document.createElement("a")
    original.href = link.href
    original.textContent = "Open the original link."
    original.target = "_blank"
    original.rel = "noreferrer noopener"
    error.append(original)

    /** @type {HTMLImageElement | HTMLVideoElement | HTMLIFrameElement} */
    let element
    if (media.kind === "image") {
      const image = document.createElement("img")
      image.alt = `Image from ${new URL(media.src).hostname}`
      image.loading = "lazy"
      image.decoding = "async"
      image.referrerPolicy = "no-referrer"
      const open = original.cloneNode(false)
      if (open instanceof HTMLAnchorElement) {
        open.append(image)
        wrapper.append(open)
      }
      element = image
    } else if (media.kind === "video") {
      const video = document.createElement("video")
      video.controls = true
      video.playsInline = true
      video.preload = "metadata"
      video.setAttribute("aria-label", "Linked video")
      wrapper.append(video)
      element = video
    } else {
      const frame = document.createElement("iframe")
      frame.title = "YouTube video"
      frame.loading = "lazy"
      // YouTube requires an origin Referer; omit the article path, not the entire header.
      frame.referrerPolicy = "strict-origin-when-cross-origin"
      frame.allow = "fullscreen; picture-in-picture; encrypted-media"
      frame.allowFullscreen = true
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation")
      wrapper.append(frame)
      element = frame
    }
    wrapper.append(error)

    function fail() {
      wrapper.dataset.state = "error"
      element.hidden = true
      error.hidden = false
    }

    function loaded() {
      // Loading an iframe does not prove that YouTube permits playback.
      wrapper.dataset.state = media.kind === "youtube" ? "embedded" : "ready"
      element.hidden = false
      error.hidden = true
    }

    const event = media.kind === "video" ? "loadedmetadata" : "load"
    element.addEventListener("error", fail)
    element.addEventListener(event, loaded)
    element.src = media.src

    return {
      href: link.href,
      media,
      wrapper,
      dispose() {
        element.removeEventListener("error", fail)
        element.removeEventListener(event, loaded)
        if (element instanceof HTMLVideoElement) element.pause()
        element.removeAttribute("src")
        if (element instanceof HTMLVideoElement) element.load()
        wrapper.remove()
      },
    }
  }

  function startPttAutoMedia() {
    if (document.getElementById(`${PREFIX}-style`)) return () => {}
    const style = document.createElement("style")
    style.id = `${PREFIX}-style`
    style.textContent = `
      #main-content .${PREFIX} {
        display: block; margin: 8px 0 16px; max-width: 100%;
        min-width: 0; white-space: normal;
      }
      #main-content .${PREFIX} img, #main-content .${PREFIX} video,
      #main-content .richcontent img, #main-content .richcontent video {
        display: block; max-width: 100%; max-height: 85vh;
        width: auto; height: auto; object-fit: contain;
      }
      #main-content .${PREFIX} iframe {
        display: block; width: min(800px, 100%); aspect-ratio: 16 / 9;
        height: auto; border: 0;
      }
      #main-content .richcontent iframe {
        max-width: 100%; aspect-ratio: 16 / 9; height: auto;
      }
      #main-content .${PREFIX} [hidden] { display: none; }
      #main-content .${PREFIX}-error {
        padding: 8px; border-inline-start: 3px solid #c96;
        color: #ccc; font: 14px/1.5 system-ui; overflow-wrap: anywhere;
      }
    `
    document.head.append(style)

    /** @type {Map<HTMLAnchorElement, Preview>} */
    const previews = new Map()
    let stopped = false
    /** @type {number | undefined} */
    let timer

    function refresh() {
      const main = document.getElementById("main-content")
      for (const [link, preview] of previews) {
        if (
          !main?.contains(link) ||
          !link.hasAttribute("href") ||
          link.closest(`.richcontent, .${PREFIX}`)
        ) {
          preview.dispose()
          previews.delete(link)
        }
      }
      if (!main) return
      /** @type {Map<Element, Element>} */
      const tails = new Map()
      for (const link of main.querySelectorAll("a[href]")) {
        if (!(link instanceof HTMLAnchorElement)) continue
        if (link.closest(`.richcontent, .${PREFIX}`)) continue
        const media = link.querySelector("img, video, iframe") ? undefined : mediaOf(link.href)
        let preview = previews.get(link)
        if (!media || hasNativeEmbed(link, media)) {
          preview?.dispose()
          previews.delete(link)
          continue
        }
        if (
          preview &&
          (preview.href !== link.href ||
            preview.media.src !== media.src ||
            !preview.wrapper.isConnected)
        ) {
          preview.dispose()
          previews.delete(link)
          preview = undefined
        }
        if (!preview) {
          preview = createPreview(link, media)
          previews.set(link, preview)
        }
        // Keep the push author, text, and timestamp on their original line.
        const anchor = link.closest(".push") || link
        const previous = tails.get(anchor) || anchor
        if (previous.nextElementSibling !== preview.wrapper) previous.after(preview.wrapper)
        tails.set(anchor, preview.wrapper)
      }
    }

    const observer = new MutationObserver(() => {
      if (timer !== undefined || stopped) return
      timer = window.setTimeout(() => {
        timer = undefined
        if (!stopped) refresh()
      }, 50)
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "src"],
    })
    refresh()

    return () => {
      stopped = true
      observer.disconnect()
      window.clearTimeout(timer)
      for (const preview of previews.values()) preview.dispose()
      previews.clear()
      style.remove()
    }
  }

  return startPttAutoMedia()
})()
