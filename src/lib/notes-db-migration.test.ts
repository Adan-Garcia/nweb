import { openDB } from "idb";
import { describe, expect, it } from "vitest";

/**
 * Every other suite starts on an empty database, so nothing else exercises the upgrade
 * itself. This one writes a real version 3 database first, the shape an existing user has
 * on disk, and then opens it through the app.
 */
describe("upgrading a version 3 notes database", () => {
  it("turns the five path strings into records and repoints the notes at them", async () => {
    const legacyDatabase = await openDB("cuervo-notes", 3, {
      upgrade(database) {
        database.createObjectStore("notes-documents", { keyPath: "id" });
        database.createObjectStore("notes-media", { keyPath: "id" });
        database.createObjectStore("notes-directory", { keyPath: "id" });
      },
    });

    // Two notes in the same branch but different units, and one in another branch.
    await legacyDatabase.put("notes-directory", {
      id: "note-a",
      wing: "My Wing",
      flight: "Fall 2026",
      branch: "Biology 101",
      nest: "Unit 1",
      feather: "Lecture",
      createdMode: "linear",
      createdAt: 10,
      updatedAt: 20,
      deletedAt: null,
    });
    await legacyDatabase.put("notes-directory", {
      id: "note-b",
      wing: "My Wing",
      flight: "Fall 2026",
      branch: "Biology 101",
      nest: "Unit 2",
      feather: "Lab",
      createdMode: "spatial",
      createdAt: 11,
      updatedAt: 21,
      deletedAt: null,
    });
    await legacyDatabase.put("notes-directory", {
      id: "note-c",
      wing: "My Wing",
      flight: "Spring 2026",
      branch: "History",
      nest: "",
      feather: "Essay",
      createdMode: "linear",
      createdAt: 12,
      updatedAt: 22,
      deletedAt: null,
    });
    await legacyDatabase.put("notes-documents", {
      id: "note-a",
      linearCompressed: new Uint8Array([1, 2, 3]),
      linearCompressionAlgorithm: "gzip",
      sceneCompressed: null,
      sceneCompressionAlgorithm: null,
      sceneFiles: [],
      updatedAt: 20,
    });
    legacyDatabase.close();

    // The calendar lived in localStorage, keyed by one of five hard-coded subjects.
    window.localStorage.setItem(
      "cuervo-calendar-events-v1",
      JSON.stringify([
        {
          id: 1,
          title: "Math Study Session",
          date: "2026-04-16",
          time: "3:30 PM",
          color: "Math",
          status: "incomplete",
        },
      ]),
    );

    const { listNotesDirectoryEntries } = await import("./notes-directory-storage");
    const { loadWorkspaceSnapshot } = await import("./workspace-storage");
    const { loadNotesDocument } = await import("./notes-document-storage");
    const { listTwigs } = await import("./twig-storage");
    const { branchPath, nestsForBranch } = await import("./workspace-tree");

    const snapshot = await loadWorkspaceSnapshot();
    const entries = await listNotesDirectoryEntries();

    // One wing, two flights, and a branch under each; nests belong to their branch.
    expect(snapshot.wings.map((wing) => wing.name)).toEqual(["My Wing"]);
    expect(snapshot.flights.map((flight) => flight.name).sort()).toEqual([
      "Fall 2026",
      "Spring 2026",
    ]);
    expect(snapshot.branches.map((branch) => branch.name).sort()).toEqual([
      "Biology 101",
      "History",
      "Math",
    ]);

    const noteA = entries.find((entry) => entry.id === "note-a");
    const noteB = entries.find((entry) => entry.id === "note-b");
    const noteC = entries.find((entry) => entry.id === "note-c");

    // Notes in the same branch now share one branch record rather than repeating its name.
    expect(noteA?.branchId).toBe(noteB?.branchId);
    expect(noteA?.branchId).not.toBe(noteC?.branchId);

    const path = branchPath(snapshot, noteA?.branchId ?? null);
    expect(path).toMatchObject({
      wing: { name: "My Wing" },
      flight: { name: "Fall 2026", term: "Fall", year: 2026 },
      branch: { name: "Biology 101" },
    });

    // The unit became a tag on the note, and the branch owns both of them.
    expect(nestsForBranch(snapshot, noteA?.branchId ?? null).map((nest) => nest.name)).toEqual([
      "Unit 1",
      "Unit 2",
    ]);
    expect(noteA?.nestIds).toHaveLength(1);
    // A note with no unit carries no tag at all rather than an empty one.
    expect(noteC?.nestIds).toEqual([]);

    // Ids and content are untouched, so every document is still reachable.
    expect(await loadNotesDocument("note-a")).not.toBeNull();

    // The calendar event became a twig under a branch named for its subject.
    const twigs = await listTwigs();
    expect(twigs).toHaveLength(1);
    expect(twigs[0]).toMatchObject({
      title: "Math Study Session",
      dueDate: "2026-04-16",
      dueTime: "3:30 PM",
      status: "incomplete",
      kind: "homework",
    });
    expect(branchPath(snapshot, twigs[0].branchId)?.branch.name).toBe("Math");

    // The events are left in localStorage: if the upgrade had aborted, the retry needs them.
    expect(window.localStorage.getItem("cuervo-calendar-events-v1")).not.toBeNull();
  });
});
