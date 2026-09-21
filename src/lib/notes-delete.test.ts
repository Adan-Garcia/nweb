import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";

import { BRANCH_ID } from "@/test/workspace-fixtures";

import { getNotesDb } from "./notes-db";
import { softDeleteNote } from "./notes-delete";
import {
  createNotesDirectoryEntry,
  findNotesDirectoryEntry,
  listNotesDirectoryEntries,
} from "./notes-directory-storage";

async function seedNoteWithMedia(feather: string, mediaId = `media-${feather}`) {
  const entry = await createNotesDirectoryEntry({ branchId: BRANCH_ID, feather });
  const database = await getNotesDb();

  await database.put("notes-documents", {
    id: entry.id,
    linearCompressed: new Uint8Array([1, 2, 3]),
    linearCompressionAlgorithm: "none",
    sceneCompressed: null,
    sceneCompressionAlgorithm: null,
    sceneFiles: [{ id: mediaId, mimeType: "image/webp", created: 1 }],
    updatedAt: 1,
  });
  await database.put("notes-media", {
    id: mediaId,
    blob: new Blob([new Uint8Array([9])], { type: "image/webp" }),
    mimeType: "image/webp",
    created: 1,
    updatedAt: 1,
  });

  return entry;
}

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("notes-directory"),
    database.clear("notes-documents"),
    database.clear("notes-media"),
    database.clear("pebbles"),
  ]);
});

describe("softDeleteNote", () => {
  it("tombstones the entry so it stops being listed or found by its title", async () => {
    const entry = await seedNoteWithMedia("Notes A");

    expect(await softDeleteNote(entry.id)).toBe(true);

    expect(await listNotesDirectoryEntries()).toHaveLength(0);
    expect(await findNotesDirectoryEntry({ branchId: BRANCH_ID, feather: "Notes A" })).toBeNull();

    // The row itself stays, carrying the timestamp a future sync needs.
    const database = await getNotesDb();
    const stored = await database.get("notes-directory", entry.id);
    expect(stored?.deletedAt).toEqual(expect.any(Number));
  });

  it("drops the document and its media, so a tombstone keeps no content", async () => {
    const entry = await seedNoteWithMedia("Notes A");

    await softDeleteNote(entry.id);

    const database = await getNotesDb();
    expect(await database.get("notes-documents", entry.id)).toBeUndefined();
    expect(await database.get("notes-media", "media-Notes A")).toBeUndefined();
  });

  it("leaves every other note alone", async () => {
    const doomed = await seedNoteWithMedia("Notes A");
    const survivor = await seedNoteWithMedia("Notes B");

    await softDeleteNote(doomed.id);

    const database = await getNotesDb();
    expect((await listNotesDirectoryEntries()).map((entry) => entry.id)).toEqual([survivor.id]);
    expect(await database.get("notes-documents", survivor.id)).toBeDefined();
    expect(await database.get("notes-media", "media-Notes B")).toBeDefined();
  });

  it("keeps an image another note still draws", async () => {
    // Excalidraw derives a file's id from its contents, so the same picture dropped into
    // two notes really is one row. Deleting either note must not blank out the other.
    const doomed = await seedNoteWithMedia("Notes A", "shared-media");
    await seedNoteWithMedia("Notes B", "shared-media");

    await softDeleteNote(doomed.id);

    const database = await getNotesDb();
    expect(await database.get("notes-media", "shared-media")).toBeDefined();
  });

  it("keeps an image a pebble still lists", async () => {
    const entry = await seedNoteWithMedia("Notes A", "filed-media");
    const database = await getNotesDb();
    await database.put("pebbles", {
      id: "pebble-1",
      branchId: BRANCH_ID,
      nestIds: [],
      name: "Diagram",
      mimeType: "image/webp",
      size: 1,
      mediaId: "filed-media",
      featherId: null,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    });

    await softDeleteNote(entry.id);

    expect(await database.get("notes-media", "filed-media")).toBeDefined();
  });

  it("reports nothing to do for an unknown id or a note already deleted", async () => {
    const entry = await seedNoteWithMedia("Notes A");

    expect(await softDeleteNote("no-such-note")).toBe(false);
    expect(await softDeleteNote(entry.id)).toBe(true);
    expect(await softDeleteNote(entry.id)).toBe(false);
  });

  it("deletes an entry written before deletedAt existed", async () => {
    // A row from an older version has no deletedAt key at all, which is not the same as
    // null. The typed handle cannot express that shape, so this one is written through a
    // raw one. No version argument: it opens whatever version getNotesDb already created.
    const rawDatabase = await openDB("cuervo-notes");
    await rawDatabase.put("notes-directory", {
      id: "legacy-note",
      branchId: BRANCH_ID,
      feather: "Legacy",
      createdMode: "linear",
      createdAt: 1,
      updatedAt: 1,
    });
    rawDatabase.close();

    expect(await softDeleteNote("legacy-note")).toBe(true);
    expect(await listNotesDirectoryEntries()).toHaveLength(0);
  });
});
