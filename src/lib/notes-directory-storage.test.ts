import { describe, expect, it, vi } from "vitest";

import { BRANCH_ID, NEST_ID } from "@/test/workspace-fixtures";

import { forgetKeyring, holdKeyring } from "./keys/object-keys";
import { getNotesDb } from "./notes-db";
import {
  createNotesDirectoryEntry,
  findNotesDirectoryEntry,
  listNotesDirectoryEntries,
  renameNotesDirectoryEntry,
  setNotesDirectoryEntryPlacement,
  touchNotesDirectoryEntry,
  upsertNotesDirectoryEntry,
} from "./notes-directory-storage";
import type { NotesDirectoryEntry } from "./notes-model";

/** This account holds the note's key through a reader grant, and nothing more. */
function readOnly(keyId: string) {
  holdKeyring(new Map(), {
    keys: [],
    wraps: [],
    grants: [{ keyId, role: "reader", wrapped: "g" }],
  });
}

describe("notes directory storage", () => {
  it("creates an entry, defaulting the created mode to linear", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const entry = await upsertNotesDirectoryEntry({
      id: "dir-create",
      branchId: BRANCH_ID,
      feather: "A",
    });

    expect(entry).toMatchObject({
      id: "dir-create",
      branchId: BRANCH_ID,
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
      branchId: BRANCH_ID,
      feather: "B",
      createdMode: "spatial",
    });
    expect(entry.createdMode).toBe("spatial");
  });

  it("keeps createdAt and createdMode when the entry is upserted again", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1000).mockReturnValueOnce(1000).mockReturnValue(5000);
    await upsertNotesDirectoryEntry({
      id: "dir-again",
      branchId: BRANCH_ID,
      feather: "C",
      createdMode: "spatial",
    });
    const second = await upsertNotesDirectoryEntry({
      id: "dir-again",
      branchId: BRANCH_ID,
      feather: "C2",
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
    await upsertNotesDirectoryEntry({ id: "dir-newest", branchId: BRANCH_ID, feather: "N" });

    const entries = await listNotesDirectoryEntries();

    expect(entries[0].id).toBe("dir-newest");
    const updatedAt = entries.map((entry) => entry.updatedAt);
    expect(updatedAt).toEqual([...updatedAt].sort((a, b) => b - a));
  });

  it("touch bumps updatedAt on an existing entry", async () => {
    vi.spyOn(Date, "now").mockReturnValue(20_000);
    await upsertNotesDirectoryEntry({ id: "dir-touch", branchId: BRANCH_ID, feather: "T" });

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
    const first = await createNotesDirectoryEntry({ branchId: BRANCH_ID, feather: "Lecture" });
    const second = await createNotesDirectoryEntry({ branchId: BRANCH_ID, feather: "Lecture" });

    expect(first.id).not.toBe(second.id);
    expect(first.id).not.toContain("lecture");
    expect(first.deletedAt).toBeNull();
  });

  it("finds a note by branch and title, and nothing when the title is free", async () => {
    const created = await createNotesDirectoryEntry({ branchId: BRANCH_ID, feather: "Findable" });

    expect(
      await findNotesDirectoryEntry({ branchId: BRANCH_ID, feather: "Findable" }),
    ).toMatchObject({ id: created.id });
    expect(await findNotesDirectoryEntry({ branchId: BRANCH_ID, feather: "Absent" })).toBeNull();
  });

  it("keeps the same title apart in two different branches", async () => {
    const here = await createNotesDirectoryEntry({ branchId: BRANCH_ID, feather: "Notes" });
    const there = await createNotesDirectoryEntry({ branchId: "branch-2", feather: "Notes" });

    expect(here.id).not.toBe(there.id);
    expect(await findNotesDirectoryEntry({ branchId: "branch-2", feather: "Notes" })).toMatchObject(
      { id: there.id },
    );
  });

  it("renames a note without changing its id", async () => {
    const created = await createNotesDirectoryEntry({ branchId: BRANCH_ID, feather: "Before" });

    const renamed = await renameNotesDirectoryEntry(created.id, "After");

    expect(renamed).toMatchObject({ id: created.id, feather: "After" });
    expect(await renameNotesDirectoryEntry("no-such-note", "X")).toBeNull();
  });

  it("replaces the tags on a note, and can move it to another branch", async () => {
    const created = await createNotesDirectoryEntry({
      branchId: BRANCH_ID,
      feather: "Tagged",
      nestIds: [NEST_ID],
    });

    const moved = await setNotesDirectoryEntryPlacement(created.id, {
      branchId: "branch-2",
      nestIds: ["nest-2", "nest-3"],
    });

    expect(moved).toMatchObject({ branchId: "branch-2", nestIds: ["nest-2", "nest-3"] });
    expect(await setNotesDirectoryEntryPlacement("no-such-note", { nestIds: [] })).toBeNull();
  });

  it("lists an entry written before deletedAt and nestIds existed", async () => {
    const database = await getNotesDb();
    // Exactly what an upgraded database holds when the fields are absent, not null.
    const legacy = {
      id: "legacy-entry",
      branchId: BRANCH_ID,
      feather: "Legacy",
      createdMode: "linear",
      createdAt: 1,
      updatedAt: 2,
    } as NotesDirectoryEntry;
    await database.put("notes-directory", legacy);

    const entries = await listNotesDirectoryEntries();
    const found = entries.find((entry) => entry.id === "legacy-entry");

    expect(found).toBeDefined();
    expect(found?.deletedAt).toBeNull();
    expect(found?.nestIds).toEqual([]);
  });

  it("hides a tombstoned entry from the listing and from lookups", async () => {
    const database = await getNotesDb();
    const created = await createNotesDirectoryEntry({ branchId: BRANCH_ID, feather: "Doomed" });
    await database.put("notes-directory", { ...created, deletedAt: 1234 });

    const entries = await listNotesDirectoryEntries();

    expect(entries.some((entry) => entry.id === created.id)).toBe(false);
    expect(await findNotesDirectoryEntry({ branchId: BRANCH_ID, feather: "Doomed" })).toBeNull();
  });

  it("will not rename or move a note shared with this account to read", async () => {
    const entry = await createNotesDirectoryEntry({ branchId: BRANCH_ID, feather: "Theirs" });
    const database = await getNotesDb();
    const stored = await database.get("notes-directory", entry.id);

    await database.put("notes-directory", { ...stored!, keyId: "their-key" });
    readOnly("their-key");

    try {
      expect(await renameNotesDirectoryEntry(entry.id, "Mine now")).toBeNull();
      expect(await setNotesDirectoryEntryPlacement(entry.id, { nestIds: [NEST_ID] })).toBeNull();
      expect(await database.get("notes-directory", entry.id)).toMatchObject({
        feather: "Theirs",
        nestIds: [],
      });
    } finally {
      forgetKeyring();
    }
  });
});
