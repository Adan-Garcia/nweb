import { openDB } from "idb";
import { describe, expect, it } from "vitest";

/**
 * The upgrade only runs against a database that already exists, and each suite gets its
 * own IndexedDB, so this file covers what the happy-path migration test cannot: a stored
 * calendar that cannot be read, and rows that are already in the new shape.
 */
describe("upgrading with input the migration cannot use", () => {
  it("still upgrades when the stored calendar is not readable, and leaves it in place", async () => {
    const legacyDatabase = await openDB("cuervo-notes", 3, {
      upgrade(database) {
        database.createObjectStore("notes-documents", { keyPath: "id" });
        database.createObjectStore("notes-media", { keyPath: "id" });
        database.createObjectStore("notes-directory", { keyPath: "id" });
      },
    });

    await legacyDatabase.put("notes-directory", {
      id: "note-a",
      wing: "My Wing",
      flight: "Fall 2026",
      branch: "Biology",
      nest: "Unit 1",
      feather: "Lecture",
      createdMode: "linear",
      createdAt: 10,
      updatedAt: 20,
      deletedAt: null,
    });
    // A row already in the version 4 shape, which the migration must not touch.
    await legacyDatabase.put("notes-directory", {
      id: "note-new",
      branchId: "already-migrated",
      nestIds: [],
      feather: "Untouched",
      createdMode: "linear",
      createdAt: 30,
      updatedAt: 40,
      deletedAt: null,
    });
    legacyDatabase.close();

    window.localStorage.setItem("cuervo-calendar-events-v1", "{ not json");

    const { listNotesDirectoryEntries } = await import("../notes/notes-directory-storage");
    const { loadWorkspaceSnapshot } = await import("../hierarchy/workspace-storage");
    const { listTwigs } = await import("../twigs/twig-storage");

    const entries = await listNotesDirectoryEntries();
    const snapshot = await loadWorkspaceSnapshot();

    // The note still migrated, so one bad value in localStorage does not cost the notes.
    expect(entries.find((entry) => entry.id === "note-a")?.branchId).toBe(
      snapshot.branches.find((branch) => branch.name === "Biology")?.id,
    );

    // The row that was already in shape kept its branch rather than being re-pointed.
    expect(entries.find((entry) => entry.id === "note-new")).toMatchObject({
      branchId: "already-migrated",
      feather: "Untouched",
    });

    // Nothing could be read out of the calendar, so no twigs were invented.
    expect(await listTwigs()).toEqual([]);
    expect(window.localStorage.getItem("cuervo-calendar-events-v1")).toBe("{ not json");
  });
});
