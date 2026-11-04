import { readFileSync } from "node:fs"
import { Script } from "node:vm"
import { JSDOM } from "jsdom"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

const source = readFileSync(
  new URL("../src/youtube-live-rewind/youtube-live-rewind.user.js", import.meta.url),
  "utf8",
)
const installUrl =
  "https://raw.githubusercontent.com/narumiruna/userscripts/main/src/youtube-live-rewind/youtube-live-rewind.user.js"
const initialKey = "ytInitialPlayerResponse"
let dom
let page
let stop

function liveResponse() {
  return {
    videoDetails: { videoId: "vUFuPPevafo", isLive: true, isLiveDvrEnabled: false },
    playerConfig: {
      mediaCommonConfig: {
        useServerDrivenAbr: true,
        serverPlaybackStartConfig: { enable: true, other: "unchanged" },
      },
    },
    streamingData: {
      serverAbrStreamingUrl: "https://example.com/server-abr",
      adaptiveFormats: [
        {
          itag: 137,
          mimeType: "video/mp4",
          url: "https://example.com/video",
          maxDvrDurationSec: 43200,
        },
        {
          itag: 140,
          mimeType: "audio/mp4",
          url: "https://example.com/audio",
          maxDvrDurationSec: 43200,
        },
      ],
    },
  }
}

function start() {
  stop = page.eval(source)
  expect(stop).toBeTypeOf("function")
}

function expectDvr(response) {
  expect(response.videoDetails.isLiveDvrEnabled).toBe(true)
  expect(response.playerConfig.mediaCommonConfig.useServerDrivenAbr).toBe(false)
  expect(response.playerConfig.mediaCommonConfig.serverPlaybackStartConfig).toEqual({
    enable: false,
    other: "unchanged",
  })
}

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://www.youtube.com/",
    runScripts: "outside-only",
  })
  page = dom.window
  stop = () => {}
})

afterEach(() => {
  stop()
  dom.window.close()
})

test("the exact source is installable, runs early, and requires the page context", () => {
  const header = source.match(/^\/\/ ==UserScript==\n[\s\S]*?\/\/ ==\/UserScript==/)
  expect(header).not.toBeNull()
  for (const [field, value] of [
    ["version", "0.1.0"],
    ["grant", "none"],
    ["run-at", "document-start"],
    ["sandbox", "raw"],
    ["inject-into", "page"],
  ]) {
    expect(header[0]).toMatch(new RegExp(`^// @${field}\\s+${value.replaceAll(".", "\\.")}$`, "m"))
  }
  expect(header[0]).toMatch(/^\/\/ @noframes$/m)
  expect([...header[0].matchAll(/^\/\/ @match\s+(.+)$/gm)].map((match) => match[1])).toEqual([
    "https://www.youtube.com/*",
  ])
  for (const field of ["downloadURL", "updateURL"]) {
    expect(source.match(new RegExp(`^// @${field}\\s+(.+)$`, "m"))?.[1]).toBe(installUrl)
  }
  expect(() => new Script(source)).not.toThrow()
  expect(source).not.toMatch(/^\s*(import|export)\s/m)
  expect(source).not.toMatch(/^\/\/ @(require|resource)\s/m)
})

test("starts without a document root and adds no replacement UI or public API", () => {
  const prototypeKeys = Reflect.ownKeys(page.Object.prototype)
  page.document.documentElement.remove()
  start()
  expect(page.startYouTubeLiveRewind).toBeUndefined()
  expect(page.patchResponse).toBeUndefined()
  expect(page.document.documentElement).toBeNull()
  expect(Reflect.ownKeys(page.Object.prototype)).toEqual(prototypeKeys)
  expect(page.localStorage.length).toBe(0)
})

test("patches the initial inline var before the player reads it and releases the hook", () => {
  start()
  page.eval(`var ${initialKey} = ${JSON.stringify(liveResponse())};`)
  expectDvr(page[initialKey])
  const descriptor = Object.getOwnPropertyDescriptor(page, initialKey)
  expect(descriptor.get).toBeUndefined()
  expect(descriptor.writable).toBe(true)
  expect(page[initialKey].streamingData.serverAbrStreamingUrl).toBeUndefined()
  expect(page[initialKey].streamingData.adaptiveFormats).toEqual(
    liveResponse().streamingData.adaptiveFormats,
  )
})

test("patches an initial response that already exists without replacing its descriptor", () => {
  const response = liveResponse()
  page[initialKey] = response
  const before = Object.getOwnPropertyDescriptor(page, initialKey)
  start()
  expectDvr(response)
  expect(Object.getOwnPropertyDescriptor(page, initialKey)).toEqual(before)
})

test("preserves data-property attributes when an initial response arrives", () => {
  Object.defineProperty(page, initialKey, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: undefined,
  })
  start()
  const response = liveResponse()
  page[initialKey] = response
  expectDvr(response)
  expect(Object.getOwnPropertyDescriptor(page, initialKey)).toEqual({
    configurable: true,
    enumerable: false,
    writable: true,
    value: response,
  })
})

test("preserves an existing getter/setter and supplies patched data to the setter", () => {
  let value
  const get = () => value
  const set = vi.fn((next) => {
    expectDvr(next)
    value = next
  })
  const descriptor = { configurable: true, enumerable: false, get, set }
  Object.defineProperty(page, initialKey, descriptor)
  start()
  const response = liveResponse()
  page[initialKey] = response
  expect(set).toHaveBeenCalledExactlyOnceWith(response)
  expect(page[initialKey]).toBe(response)
  expect(Object.getOwnPropertyDescriptor(page, initialKey)).toEqual(descriptor)
})

test.each(["non-configurable", "read-only", "getter-only", "throwing-getter"])(
  "leaves a %s initial global intact while parsed responses remain supported",
  (kind) => {
    const descriptor =
      kind === "getter-only" || kind === "throwing-getter"
        ? {
            configurable: true,
            get: () => {
              if (kind === "throwing-getter") throw new Error("other script")
              return undefined
            },
          }
        : { configurable: kind !== "non-configurable", writable: kind !== "read-only" }
    Object.defineProperty(page, initialKey, descriptor)
    const before = Object.getOwnPropertyDescriptor(page, initialKey)
    start()
    expect(Object.getOwnPropertyDescriptor(page, initialKey)).toEqual(before)
    expectDvr(page.JSON.parse(JSON.stringify(liveResponse())))
    stop()
    expect(Object.getOwnPropertyDescriptor(page, initialKey)).toEqual(before)
  },
)

test("patches a current live object even when its global property is not configurable", () => {
  const response = liveResponse()
  Object.defineProperty(page, initialKey, { value: response })
  start()
  expectDvr(response)
})

test("patches both direct and wrapped responses on later in-site navigation", () => {
  start()
  for (let i = 0; i < 3; i++) {
    const response = page.JSON.parse(JSON.stringify(liveResponse()))
    const wrapped = page.JSON.parse(JSON.stringify({ playerResponse: liveResponse(), keep: i }))
    expectDvr(response)
    expectDvr(wrapped.playerResponse)
    expect(wrapped.keep).toBe(i)
  }
})

test.each([false, undefined, "true", 1])(
  "does not treat isLive=%s as an active live stream",
  (isLive) => {
    const response = liveResponse()
    response.videoDetails.isLive = isLive
    response.videoDetails.isLiveContent = true
    const serialized = JSON.stringify(response)
    start()
    expect(page.JSON.parse(serialized)).toEqual(JSON.parse(serialized))
    page[initialKey] = response
    expect(response).toEqual(JSON.parse(serialized))
  },
)

test("leaves already-enabled native DVR and its playback transport unchanged", () => {
  const response = liveResponse()
  response.videoDetails.isLiveDvrEnabled = true
  response.streamingData.hlsManifestUrl = "https://example.com/manifest"
  const serialized = JSON.stringify(response)
  start()
  expect(page.JSON.parse(serialized)).toEqual(response)
  page[initialKey] = response
  expect(response).toEqual(JSON.parse(serialized))
})

test.each(["hlsManifestUrl", "dashManifestUrl"])(
  "uses an available %s instead of the server-ABR stream without changing DVR limits",
  (key) => {
    const response = liveResponse()
    response.streamingData[key] = "https://example.com/manifest"
    response.streamingData.adaptiveFormats = []
    start()
    const parsed = page.JSON.parse(JSON.stringify(response))
    expectDvr(parsed)
    expect(parsed.streamingData.serverAbrStreamingUrl).toBeUndefined()
    expect(parsed.streamingData[key]).toBe(response.streamingData[key])
    expect(parsed.streamingData.adaptiveFormats).toEqual(response.streamingData.adaptiveFormats)
  },
)

test.each([undefined, null, "", false, 1, {}])(
  "keeps the server-ABR transport if there is no usable client-side source: %s",
  (value) => {
    const response = liveResponse()
    response.streamingData.hlsManifestUrl = value
    response.streamingData.dashManifestUrl = value
    response.streamingData.adaptiveFormats = []
    start()
    const parsed = page.JSON.parse(JSON.stringify(response))
    expect(parsed.videoDetails.isLiveDvrEnabled).toBe(true)
    expect(parsed.playerConfig).toEqual(response.playerConfig)
    expect(parsed.streamingData).toEqual(JSON.parse(JSON.stringify(response.streamingData)))
  },
)

test("removes the server-ABR URL when direct audio/video URLs exist without a manifest", () => {
  const response = liveResponse()
  start()
  const parsed = page.JSON.parse(JSON.stringify(response))
  expectDvr(parsed)
  expect(parsed.streamingData.serverAbrStreamingUrl).toBeUndefined()
  expect(parsed.streamingData.adaptiveFormats).toEqual(response.streamingData.adaptiveFormats)
})

test.each([
  "audio-only",
  "video-only",
  "empty-url",
  "missing-url",
  "cipher-only",
  "missing-mime",
  "invalid-entry",
  "not-an-array",
])("does not discard the server-ABR transport for incomplete direct formats: %s", (kind) => {
  const response = liveResponse()
  const formats = response.streamingData.adaptiveFormats
  if (kind === "audio-only") formats.shift()
  if (kind === "video-only") formats.pop()
  if (kind === "empty-url") formats[0].url = ""
  if (kind === "missing-url") delete formats[0].url
  if (kind === "cipher-only") {
    delete formats[0].url
    formats[0].signatureCipher = "cipher"
  }
  if (kind === "missing-mime") delete formats[0].mimeType
  if (kind === "invalid-entry") formats[0] = null
  if (kind === "not-an-array") response.streamingData.adaptiveFormats = {}
  start()
  const parsed = page.JSON.parse(JSON.stringify(response))
  expect(parsed.videoDetails.isLiveDvrEnabled).toBe(true)
  expect(parsed.playerConfig).toEqual(response.playerConfig)
  expect(parsed.streamingData).toEqual(response.streamingData)
})

test.each([
  { videoDetails: { isLive: true } },
  { videoDetails: { isLive: true }, playerConfig: null, streamingData: [] },
  { videoDetails: { isLive: true }, playerConfig: { mediaCommonConfig: false } },
  {
    videoDetails: { isLive: true },
    playerConfig: { mediaCommonConfig: { serverPlaybackStartConfig: null } },
  },
])("accepts live data with absent or malformed optional fields: %j", (response) => {
  start()
  const parsed = page.JSON.parse(JSON.stringify(response))
  expect(parsed.videoDetails.isLiveDvrEnabled).toBe(true)
})

test.each([
  null,
  false,
  42,
  "video",
  [],
  [liveResponse()],
  { videoDetails: null },
  { playerResponse: "not a response" },
  { responseContext: {}, comments: [{ text: "keep" }] },
])("leaves unrelated JSON unchanged: %j", (value) => {
  start()
  expect(page.JSON.parse(JSON.stringify(value))).toEqual(value)
})

test("retains JSON syntax errors and reviver behavior", () => {
  start()
  expect(() => page.JSON.parse("{")).toThrow()
  const reviver = vi.fn((key, value) => (key === "keep" ? value + 1 : value))
  expect(page.JSON.parse('{"keep":1}', reviver)).toEqual({ keep: 2 })
  expect(reviver.mock.calls.map(([key]) => key)).toEqual(["keep", ""])
  const error = new Error("reviver")
  expect(() =>
    page.JSON.parse("{}", () => {
      throw error
    }),
  ).toThrow(error)
})

test("does not let frozen player data interrupt JSON parsing", () => {
  start()
  const response = liveResponse()
  Object.freeze(response.videoDetails)
  expect(page.JSON.parse("{}", () => response)).toBe(response)
  expect(response.videoDetails.isLiveDvrEnabled).toBe(false)
})

test("releases the initial hook for a normal video without changing its settings", () => {
  start()
  const response = liveResponse()
  response.videoDetails.isLive = false
  page[initialKey] = response
  expect(response.videoDetails.isLiveDvrEnabled).toBe(false)
  expect(Object.getOwnPropertyDescriptor(page, initialKey).get).toBeUndefined()
})

test("starts once and duplicate cleanup does not stop the first instance", () => {
  const nativeParse = page.JSON.parse
  start()
  const activeParse = page.JSON.parse
  const duplicateStop = page.eval(source)
  expect(page.JSON.parse).toBe(activeParse)
  duplicateStop()
  expectDvr(page.JSON.parse(JSON.stringify(liveResponse())))
  stop()
  expect(page.JSON.parse).toBe(nativeParse)
  expect(page.JSON.parse(JSON.stringify(liveResponse()))).toEqual(liveResponse())
})

test("cleanup removes a pending initial hook and restores the preceding JSON parser", () => {
  const nativeParse = page.JSON.parse
  const previousParse = vi.fn((...args) => nativeParse(...args))
  page.JSON.parse = previousParse
  start()
  expectDvr(page.JSON.parse(JSON.stringify(liveResponse())))
  expect(previousParse).toHaveBeenCalledOnce()
  stop()
  stop()
  expect(Object.hasOwn(page, initialKey)).toBe(false)
  expect(page.JSON.parse).toBe(previousParse)
})

test("cleanup preserves the latest unrelated assignment and the original descriptor", () => {
  Object.defineProperty(page, initialKey, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: undefined,
  })
  start()
  page[initialKey] = { unrelated: true }
  stop()
  expect(Object.getOwnPropertyDescriptor(page, initialKey)).toEqual({
    configurable: true,
    enumerable: false,
    writable: true,
    value: { unrelated: true },
  })
})

test("preserves the receiver and extra arguments expected by an existing parser wrapper", () => {
  const nativeParse = page.JSON.parse
  const calls = []
  page.JSON.parse = function (...args) {
    calls.push({ receiver: this, args })
    return Reflect.apply(nativeParse, this, args)
  }
  start()
  const receiver = { custom: true }
  const input = JSON.stringify(liveResponse())
  const reviver = (_key, value) => value
  expectDvr(page.JSON.parse.call(receiver, input, reviver, "extra"))
  expect(calls).toEqual([{ receiver, args: [input, reviver, "extra"] }])
})

test("cleanup retains a later parser wrapper but stops patching through its delegate", () => {
  start()
  const delegate = page.JSON.parse
  const later = (...args) => delegate(...args)
  page.JSON.parse = later
  stop()
  expect(page.JSON.parse).toBe(later)
  expect(page.JSON.parse(JSON.stringify(liveResponse()))).toEqual(liveResponse())
})

test("cleanup does not overwrite a later initial-response wrapper", () => {
  start()
  const delegate = Object.getOwnPropertyDescriptor(page, initialKey)
  const set = vi.fn((value) => delegate.set(value))
  Object.defineProperty(page, initialKey, { ...delegate, set })
  stop()
  const response = liveResponse()
  page[initialKey] = response
  expect(set).toHaveBeenCalledExactlyOnceWith(response)
  expect(page[initialKey]).toBe(response)
  expect(response.videoDetails.isLiveDvrEnabled).toBe(false)
  expect(Object.getOwnPropertyDescriptor(page, initialKey).set).toBe(set)
})
