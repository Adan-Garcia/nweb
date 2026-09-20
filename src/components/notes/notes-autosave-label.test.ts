import { describe, expect, it } from "vitest"

import { getAutoSaveLabel } from "./notes-autosave-label"

const ready = { isStorageReady: true, activeDocumentId: "doc", isHydratingDocument: false, lastSavedAt: null }

describe("getAutoSaveLabel", () => {
  it("is unavailable until storage is ready and a note is open", () => {
    expect(getAutoSaveLabel({ ...ready, isStorageReady: false })).toBe("Autosave unavailable")
    expect(getAutoSaveLabel({ ...ready, activeDocumentId: null })).toBe("Autosave unavailable")
  })

  it("is paused while a note is loading", () => {
    expect(getAutoSaveLabel({ ...ready, isHydratingDocument: true })).toBe("Autosave paused while loading")
  })

  it("is enabled before the first save", () => {
    expect(getAutoSaveLabel(ready)).toBe("Autosave enabled")
  })

  it("reports the time of the last save", () => {
    const savedAt = new Date(2026, 3, 16, 14, 5, 9).getTime()
    expect(getAutoSaveLabel({ ...ready, lastSavedAt: savedAt })).toBe(
      `Autosaved at ${new Date(savedAt).toLocaleTimeString()}`,
    )
  })
})
