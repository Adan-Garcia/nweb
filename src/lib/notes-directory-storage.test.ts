import { describe, expect, it, vi } from "vitest"

import {
  listNotesDirectoryEntries,
  touchNotesDirectoryEntry,
  upsertNotesDirectoryEntry,
} from "./notes-directory-storage"
import type { NotesHierarchyLocation } from "./notes-model"

function location(feather: string): NotesHierarchyLocation {
  return { wing: "Home", flight: "Fall 2026", branch: "Math", nest: "Unit 1", feather }
}

describe("notes directory storage", () => {
  it("creates an entry, defaulting the created mode to linear", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000)
    const entry = await upsertNotesDirectoryEntry({ id: "dir-create", location: location("A") })

    expect(entry).toMatchObject({
      id: "dir-create",
      feather: "A",
      createdMode: "linear",
      createdAt: 1000,
      updatedAt: 1000,
    })
  })

  it("honours an explicit created mode on first insert", async () => {
    const entry = await upsertNotesDirectoryEntry({
      id: "dir-spatial",
      location: location("B"),
      createdMode: "spatial",
    })
    expect(entry.createdMode).toBe("spatial")
  })

  it("keeps createdAt and createdMode when the entry is upserted again", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1000).mockReturnValueOnce(1000).mockReturnValue(5000)
    await upsertNotesDirectoryEntry({ id: "dir-again", location: location("C"), createdMode: "spatial" })
    const second = await upsertNotesDirectoryEntry({
      id: "dir-again",
      location: location("C2"),
      createdMode: "linear",
    })

    expect(second).toMatchObject({ feather: "C2", createdMode: "spatial", createdAt: 1000, updatedAt: 5000 })
  })

  it("lists entries most recently updated first", async () => {
    // Later than the real-clock entries other tests in this file leave behind.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000)
    await upsertNotesDirectoryEntry({ id: "dir-newest", location: location("N") })

    const entries = await listNotesDirectoryEntries()

    expect(entries[0].id).toBe("dir-newest")
    const updatedAt = entries.map((entry) => entry.updatedAt)
    expect(updatedAt).toEqual([...updatedAt].sort((a, b) => b - a))
  })

  it("touch bumps updatedAt on an existing entry", async () => {
    vi.spyOn(Date, "now").mockReturnValue(20_000)
    await upsertNotesDirectoryEntry({ id: "dir-touch", location: location("T") })

    vi.spyOn(Date, "now").mockReturnValue(30_000)
    await touchNotesDirectoryEntry("dir-touch")

    const touched = (await listNotesDirectoryEntries()).find((entry) => entry.id === "dir-touch")
    expect(touched?.updatedAt).toBe(30_000)
    expect(touched?.createdAt).toBe(20_000)
  })

  it("touch is a no-op for an unknown entry", async () => {
    await touchNotesDirectoryEntry("dir-missing")
    const entries = await listNotesDirectoryEntries()
    expect(entries.some((entry) => entry.id === "dir-missing")).toBe(false)
  })
})
