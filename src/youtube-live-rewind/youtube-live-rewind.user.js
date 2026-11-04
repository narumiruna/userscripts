// ==UserScript==
// @name         YouTube Live Rewind
// @namespace    userscripts/youtube-live-rewind
// @version      0.1.0
// @description  Enable YouTube's native DVR timeline for active live streams when earlier segments are available.
// @match        https://www.youtube.com/*
// @downloadURL  https://raw.githubusercontent.com/narumiruna/userscripts/main/src/youtube-live-rewind/youtube-live-rewind.user.js
// @updateURL    https://raw.githubusercontent.com/narumiruna/userscripts/main/src/youtube-live-rewind/youtube-live-rewind.user.js
// @run-at       document-start
// @grant        none
// @noframes
// @sandbox      raw
// @inject-into  page
// @license      AGPL-3.0-only
// ==/UserScript==

// @ts-check

;(() => {
  // biome-ignore lint/suspicious/noRedundantUseStrict: Userscript managers run this as a classic script.
  "use strict"

  const marker = Symbol.for("userscripts.youtube-live-rewind")
  if (Reflect.get(JSON.parse, marker)) return () => {}

  let stopped = false

  /**
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
  }

  /** @param {unknown} value */
  function patchResponse(value) {
    if (stopped || !isRecord(value)) return false
    const response = isRecord(value.videoDetails) ? value : value.playerResponse
    if (!isRecord(response) || !isRecord(response.videoDetails)) return false
    if (response.videoDetails.isLive !== true || response.videoDetails.isLiveDvrEnabled === true) {
      return true
    }

    response.videoDetails.isLiveDvrEnabled = true

    const streams = response.streamingData
    if (!isRecord(streams)) return true
    const hasManifest =
      (typeof streams.hlsManifestUrl === "string" && streams.hlsManifestUrl.length > 0) ||
      (typeof streams.dashManifestUrl === "string" && streams.dashManifestUrl.length > 0)
    const formats = Array.isArray(streams.adaptiveFormats) ? streams.adaptiveFormats : []
    const hasDirectFormats = ["audio/", "video/"].every((type) =>
      formats.some(
        (format) =>
          isRecord(format) &&
          typeof format.url === "string" &&
          format.url.length > 0 &&
          typeof format.mimeType === "string" &&
          format.mimeType.startsWith(type),
      ),
    )
    if (!hasManifest && !hasDirectFormats) return true

    // A retained server-ABR URL can send a seek back to the live edge.
    // Use a manifest or direct audio/video formats; do not remove the only source.
    delete streams.serverAbrStreamingUrl
    const config = isRecord(response.playerConfig) ? response.playerConfig.mediaCommonConfig : null
    if (isRecord(config)) {
      config.useServerDrivenAbr = false
      if (isRecord(config.serverPlaybackStartConfig))
        config.serverPlaybackStartConfig.enable = false
    }
    return true
  }

  /** @param {unknown} value */
  function tryPatchResponse(value) {
    try {
      return patchResponse(value)
    } catch {
      // Frozen data or another script must not interrupt YouTube's parsing.
      return false
    }
  }

  // Initial page data is an inline object, not necessarily a JSON.parse result.
  function interceptInitialResponse() {
    const key = "ytInitialPlayerResponse"
    const previous = Object.getOwnPropertyDescriptor(window, key)
    let current = Reflect.get(window, key)
    if (tryPatchResponse(current)) return () => {}
    if (
      previous &&
      (!previous.configurable ||
        ("value" in previous ? !previous.writable : typeof previous.set !== "function"))
    ) {
      return () => {}
    }

    let assigned = false
    const get = () => (previous?.get ? previous.get.call(window) : current)
    /** @param {unknown} value */
    const set = (value) => {
      const matched = tryPatchResponse(value)
      current = value
      assigned = true
      previous?.set?.call(window, value)
      if (matched) restore()
    }
    function restore() {
      const descriptor = Object.getOwnPropertyDescriptor(window, key)
      if (descriptor?.get !== get || descriptor?.set !== set) return
      if (previous) {
        Object.defineProperty(
          window,
          key,
          "value" in previous ? { ...previous, value: current } : previous,
        )
      } else if (assigned) {
        Object.defineProperty(window, key, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: current,
        })
      } else {
        Reflect.deleteProperty(window, key)
      }
    }
    Object.defineProperty(window, key, {
      configurable: true,
      enumerable: previous?.enumerable ?? true,
      get,
      set,
    })
    return restore
  }

  // Later player responses pass through JSON.parse during YouTube navigation.
  const nativeParse = JSON.parse
  /**
   * @this {unknown}
   * @param {Parameters<typeof JSON.parse>} args
   */
  function parse(...args) {
    const value = Reflect.apply(nativeParse, this, args)
    tryPatchResponse(value)
    return value
  }
  Object.defineProperty(parse, marker, { value: true })
  JSON.parse = parse

  let restoreInitial = () => {}
  try {
    restoreInitial = interceptInitialResponse()
  } catch {
    // Leave an inaccessible global unchanged; parsed responses still work.
  }

  return () => {
    stopped = true
    restoreInitial()
    if (JSON.parse === parse) JSON.parse = nativeParse
  }
})()
