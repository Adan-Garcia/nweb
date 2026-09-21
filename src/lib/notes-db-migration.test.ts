import { openDB } from "idb";
import { describe, expect, it } from "vitest";

/**
 * Every other suite starts on an empty database, so nothing else exercises the upgrade
 * itself. This one writes a real version 2 database first, the shape an existing user has
 * on disk, and then opens it through the app.
 */
describe("upgrading a version 2 notes database", () => {
  it("keeps the notes that were already there and fills in the tombstone", async () => {
    const legacyDatabase = await openDB("cuervo-notes", 2, {
      upgrade(database) {
        database.createObjectStore("notes-documents", { keyPath: "id" });
        database.createObjectStore("notes-media", { keyPath: "id" });
        database.createObjectStore("notes-directory", { keyPath: "id" });
      },
    });

    // A version 2 row: the id is the slugified path and there is no deletedAt key.
    await legacyDatabase.put("notes-directory", {
      id: "notes-my-wing-fall-2026-general-inbox-untitled-note",
      wing: "My Wing",
      flight: "Fall 2026",
      branch: "General",
      nest: "Inbox",
      feather: "Untitled note",
      createdMode: "linear",
      createdAt: 10,
      updatedAt: 20,
    });
    await legacyDatabase.put("notes-documents", {
      id: "notes-my-wing-fall-2026-general-inbox-untitled-note",
      linearCompressed: new Uint8Array([1, 2, 3]),
      linearCompressionAlgorithm: "gzip",
      sceneCompressed: null,
      sceneCompressionAlgorithm: null,
      sceneFiles: [],
      updatedAt: 20,
    });
    legacyDatabase.close();

    const { listNotesDirectoryEntries, findNotesDirectoryEntryByLocation } =
      await import("./notes-directory-storage");
    const { loadNotesDocument } = await import("./notes-document-storage");

    const entries = await listNotesDirectoryEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "notes-my-wing-fall-2026-general-inbox-untitled-note",
      feather: "Untitled note",
      deletedAt: null,
    });

    // The old path-shaped id is left alone, so its document is still reachable.
    const document = await loadNotesDocument(entries[0].id);
    expect(document).not.toBeNull();

    // And the note is now found by its path rather than by rebuilding the id.
    expect(
      await findNotesDirectoryEntryByLocation({
        wing: "My Wing",
        flight: "Fall 2026",
        branch: "General",
        nest: "Inbox",
        feather: "Untitled note",
      }),
    ).toMatchObject({ id: "notes-my-wing-fall-2026-general-inbox-untitled-note" });
  });
});
