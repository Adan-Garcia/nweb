import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { NotesDirectoryEntry, NotesHierarchyLocation } from "@/components/notes/types"
import { useNotesLocationPicker } from "./use-notes-location-picker"

function entry(location: NotesHierarchyLocation): NotesDirectoryEntry {
  return { ...location, id: `id-${location.feather}`, createdMode: "linear", createdAt: 0, updatedAt: 0 }
}

const active: NotesHierarchyLocation = { wing: "Home", flight: "Fall", branch: "Math", nest: "Unit 1", feather: "A" }
const entries = [
  entry(active),
  entry({ ...active, feather: "B" }),
  entry({ wing: "Work", flight: "Q1", branch: "Ops", nest: "Runbooks", feather: "Oncall" }),
]

function setup(overrides: { activeLocation?: NotesHierarchyLocation; activeDocumentId?: string | null } = {}) {
  const createOrOpenDocumentAtLocation = vi.fn(async () => {})
  const openDocumentById = vi.fn(async () => {})
  const options = {
    mode: "linear" as const,
    directoryEntries: entries,
    activeDocumentId: "id-A" as string | null,
    activeLocation: active,
    createOrOpenDocumentAtLocation,
    openDocumentById,
    ...overrides,
  }
  const hook = renderHook((props) => useNotesLocationPicker(props), { initialProps: options })
  return { ...hook, options, createOrOpenDocumentAtLocation, openDocumentById }
}

describe("useNotesLocationPicker: path and options", () => {
  it("starts from the active location and summarizes it", () => {
    const { result } = setup()
    expect(result.current.draftLocation).toEqual(active)
    expect(result.current.selectedLocationSummary).toBe("Home / Fall / Math / Unit 1 / A")
  })

  it("lists the options for every level, narrowed to the draft's parents", () => {
    const { result } = setup()
    expect(result.current.segmentOptions).toEqual({
      wing: ["Home", "Work"],
      flight: ["Fall"],
      branch: ["Math"],
      nest: ["Unit 1"],
      feather: ["A", "B"],
    })
  })

  it("restarts the draft when the active location changes", () => {
    const { result, rerender, options } = setup()
    act(() => result.current.selectSegmentValue("wing", "Work"))
    expect(result.current.draftLocation.wing).toBe("Work")

    rerender({ ...options, activeLocation: { ...active, wing: "Elsewhere" } })

    expect(result.current.draftLocation.wing).toBe("Elsewhere")
  })
})

describe("useNotesLocationPicker: choosing a segment", () => {
  it("changes a parent segment and cascades to valid children without opening anything", () => {
    const { result, openDocumentById } = setup()

    act(() => result.current.selectSegmentValue("wing", "Work"))

    expect(result.current.draftLocation).toEqual({
      wing: "Work",
      flight: "Q1",
      branch: "Ops",
      nest: "Runbooks",
      feather: "Oncall",
    })
    expect(result.current.createNote.isOpen).toBe(false)
    expect(openDocumentById).not.toHaveBeenCalled()
  })

  it("opens an existing note when a different one is chosen", () => {
    const { result, openDocumentById } = setup()

    act(() => result.current.selectSegmentValue("feather", "B"))

    expect(openDocumentById).toHaveBeenCalledWith("id-B")
    expect(result.current.createNote.isOpen).toBe(false)
  })

  it("does nothing more when the note is already open", () => {
    const { result, openDocumentById } = setup()

    act(() => result.current.selectSegmentValue("feather", "A"))

    expect(openDocumentById).not.toHaveBeenCalled()
    expect(result.current.createNote.isOpen).toBe(false)
  })

  it("offers to create a note that does not exist yet, defaulting to the current mode", () => {
    const { result, openDocumentById } = setup()

    act(() => result.current.createNote.setMode("spatial"))
    act(() => result.current.selectSegmentValue("feather", "Brand new"))

    expect(openDocumentById).not.toHaveBeenCalled()
    expect(result.current.createNote.isOpen).toBe(true)
    expect(result.current.createNote.mode).toBe("linear")
  })
})

describe("useNotesLocationPicker: creating a note", () => {
  it("creates or opens the drafted path in the chosen mode, then closes the dialog", async () => {
    const { result, createOrOpenDocumentAtLocation } = setup()
    act(() => result.current.selectSegmentValue("feather", "Brand new"))
    act(() => result.current.createNote.setMode("spatial"))

    await act(async () => {
      await result.current.createNote.submit()
    })

    expect(createOrOpenDocumentAtLocation).toHaveBeenCalledWith({ ...active, feather: "Brand new" }, "spatial")
    expect(result.current.createNote.isOpen).toBe(false)
    expect(result.current.createNote.isCreating).toBe(false)
  })

  it("keeps the dialog open and stops the spinner if creation fails", async () => {
    const { result, createOrOpenDocumentAtLocation } = setup()
    createOrOpenDocumentAtLocation.mockRejectedValueOnce(new Error("disk full"))
    act(() => result.current.selectSegmentValue("feather", "Brand new"))

    await act(async () => {
      await expect(result.current.createNote.submit()).rejects.toThrow("disk full")
    })

    expect(result.current.createNote.isOpen).toBe(true)
    expect(result.current.createNote.isCreating).toBe(false)
  })
})

describe("useNotesLocationPicker: adding a segment", () => {
  it("opens the dialog pre-filled with the current value and clears it on close", () => {
    const { result } = setup()

    act(() => result.current.segmentModal.open("nest", "Unit"))
    expect(result.current.segmentModal.state).toEqual({ segment: "nest", label: "Unit" })
    expect(result.current.segmentModal.draftValue).toBe("Unit 1")

    act(() => result.current.segmentModal.close())
    expect(result.current.segmentModal.state).toBeNull()
    expect(result.current.segmentModal.draftValue).toBe("")
  })

  it("applies a whitespace-normalized value and closes", () => {
    const { result } = setup()
    act(() => result.current.segmentModal.open("branch", "Branch"))
    act(() => result.current.segmentModal.setDraftValue("  Data   Science  "))

    act(() => result.current.segmentModal.submit())

    expect(result.current.draftLocation.branch).toBe("Data Science")
    expect(result.current.segmentModal.state).toBeNull()
  })

  it("ignores a blank value and does nothing without an open dialog", () => {
    const { result } = setup()

    act(() => result.current.segmentModal.submit())
    expect(result.current.draftLocation).toEqual(active)

    act(() => result.current.segmentModal.open("branch", "Branch"))
    act(() => result.current.segmentModal.setDraftValue("   "))
    act(() => result.current.segmentModal.submit())

    expect(result.current.draftLocation).toEqual(active)
    expect(result.current.segmentModal.state).not.toBeNull()
  })

  it("offers to create the note when a new note name is added", () => {
    const { result } = setup()
    act(() => result.current.segmentModal.open("feather", "Note"))
    act(() => result.current.segmentModal.setDraftValue("Fresh"))

    act(() => result.current.segmentModal.submit())

    expect(result.current.draftLocation.feather).toBe("Fresh")
    expect(result.current.createNote.isOpen).toBe(true)
  })
})
