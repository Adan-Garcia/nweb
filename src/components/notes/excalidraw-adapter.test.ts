import { describe, expect, it } from "vitest"

import { parseStoredScene, restoreSceneFiles } from "./excalidraw-adapter"

describe("parseStoredScene", () => {
  it("returns the stored elements and app state", () => {
    const scene = parseStoredScene(JSON.stringify({ elements: [{ id: "a" }], appState: { zoom: 2 } }))
    expect(scene).toEqual({ elements: [{ id: "a" }], appState: { zoom: 2 } })
  })

  it("defaults missing parts to an empty scene", () => {
    expect(parseStoredScene("{}")).toEqual({ elements: [], appState: {} })
  })

  it("throws for invalid JSON and for non-object payloads", () => {
    expect(() => parseStoredScene("{oops")).toThrow()
    expect(() => parseStoredScene("null")).toThrow("not an object")
    expect(() => parseStoredScene('"text"')).toThrow("not an object")
  })
})

describe("restoreSceneFiles", () => {
  it("rebuilds Excalidraw's file map keyed by file id", () => {
    const restored = restoreSceneFiles({
      a: { id: "a", mimeType: "image/png", created: 1, dataUrl: "data:image/png;base64,AA==" },
      b: { id: "b", mimeType: "image/webp", created: 2, dataUrl: "data:image/webp;base64,BB==" },
    })

    expect(restored).toEqual({
      a: { id: "a", mimeType: "image/png", created: 1, dataURL: "data:image/png;base64,AA==" },
      b: { id: "b", mimeType: "image/webp", created: 2, dataURL: "data:image/webp;base64,BB==" },
    })
  })

  it("returns an empty map when there are no files", () => {
    expect(restoreSceneFiles({})).toEqual({})
  })
})
