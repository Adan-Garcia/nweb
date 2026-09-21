import { describe, expect, it, vi } from "vitest";

import { getNotesDb } from "./notes-db";
import {
  createNotesDirectoryEntry,
  findNotesDirectoryEntryByLocation,
  listNotesDirectoryEntries,
  touchNotesDirectoryEntry,
  upsertNotesDirectoryEntry,
} from "./notes-directory-storage";
import type { NotesDirectoryEntry, NotesHierarchyLocation } from "./notes-model";

function location(feather: string): NotesHierarchyLocation {
  return { wing: "Home", flight: "Fall 2026", branch: "Math", nest: "Unit 1", feather };
}

describe("notes directory storage", () => {
  it("creates an entry, defaulting the created mode to linear", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const entry = await upsertNotesDirectoryEntry({ id: "dir-create", location: location("A") });

    expect(entry).toMatchObject({
      id: "dir-create",
      feather: "A",
      createdMode: "linear",
      createdAt: 1000,
      updatedAt: 1000,
      deletedAt: null,
    });
  });

  it("honours an explicit created mode on first insert", async () => {
    const entry = await upsertNotesDirectoryEntry({
      id: "dir-spatial",
      location: location("B"),
      createdMode: "spatial",
    });
    expect(entry.createdMode).toBe("spatial");
  });

  it("keeps createdAt and createdMode when the entry is upserted again", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1000).mockReturnValueOnce(1000).mockReturnValue(5000);
    await upsertNotesDirectoryEntry({
      id: "dir-again",
      location: location("C"),
      createdMode: "spatial",
    });
    const second = await upsertNotesDirectoryEntry({
      id: "dir-again",
      location: location("C2"),
      createdMode: "linear",
    });

    expect(second).toMatchObject({
      feather: "C2",
      createdMode: "spatial",
      createdAt: 1000,
      updatedAt: 5000,
      deletedAt: null,
    });
  });

  it("lists entries most recently updated first", async () => {
    // Later than the real-clock entries other tests in this file leave behind.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
    await upsertNotesDirectoryEntry({ id: "dir-newest", location: location("N") });

    const entries = await listNotesDirectoryEntries();

    expect(entries[0].id).toBe("dir-newest");
    const updatedAt = entries.map((entry) => entry.updatedAt);
    expect(updatedAt).toEqual([...updatedAt].sort((a, b) => b - a));
  });

  it("touch bumps updatedAt on an existing entry", async () => {
    vi.spyOn(Date, "now").mockReturnValue(20_000);
    await upsertNotesDirectoryEntry({ id: "dir-touch", location: location("T") });

    vi.spyOn(Date, "now").mockReturnValue(30_000);
    await touchNotesDirectoryEntry("dir-touch");

    const touched = (await listNotesDirectoryEntries()).find((entry) => entry.id === "dir-touch");
    expect(touched?.updatedAt).toBe(30_000);
    expect(touched?.createdAt).toBe(20_000);
  });

  it("touch is a no-op for an unknown entry", async () => {
    await touchNotesDirectoryEntry("dir-missing");
    const entries = await listNotesDirectoryEntries();
    expect(entries.some((entry) => entry.id === "dir-missing")).toBe(false);
  });
});

describe("stable ids and tombstones", () => {
  it("gives every new note an id of its own, not one derived from its path", async () => {
    const first = await createNotesDirectoryEntry({ location: location("Lecture") });
    const second = await createNotesDirectoryEntry({ location: location("Lecture") });

    expect(first.id).not.toBe(second.id);
    expect(first.id).not.toContain("lecture");
    expect(first.deletedAt).toBeNull();
  });

  it("keeps paths apart that the old slugged id collapsed into one", async () => {
    const spaced = await createNotesDirectoryEntry({
      location: { ...location("Notes"), branch: "Math 101" },
    });
    const hyphenated = await createNotesDirectoryEntry({
      location: { ...location("Notes"), branch: "math-101" },
    });

    expect(spaced.id).not.toBe(hyphenated.id);
  });

  it("finds a note by its path, and nothing when the path is free", async () => {
    const created = await createNotesDirectoryEntry({ location: location("Findable") });

    expect(await findNotesDirectoryEntryByLocation(location("Findable"))).toMatchObject({
      id: created.id,
    });
    expect(await findNotesDirectoryEntryByLocation(location("Absent"))).toBeNull();
  });

  it("lists an entry written before deletedAt existed", async () => {
    const database = await getNotesDb();
    // Exactly what a version 2 database holds: the field is absent, not null.
    const legacy = {
      id: "legacy-entry",
      ...location("Legacy"),
      createdMode: "linear",
      createdAt: 1,
      updatedAt: 2,
    } as NotesDirectoryEntry;
    await database.put("notes-directory", legacy);

    const entries = await listNotesDirectoryEntries();
    const found = entries.find((entry) => entry.id === "legacy-entry");

    expect(found).toBeDefined();
    expect(found?.deletedAt).toBeNull();
  });

  it("hides a tombstoned entry from the listing and from lookups", async () => {
    const database = await getNotesDb();
    const created = await createNotesDirectoryEntry({ location: location("Doomed") });
    await database.put("notes-directory", { ...created, deletedAt: 1234 });

    const entries = await listNotesDirectoryEntries();

    expect(entries.some((entry) => entry.id === created.id)).toBe(false);
    expect(await findNotesDirectoryEntryByLocation(location("Doomed"))).toBeNull();
  });
});
