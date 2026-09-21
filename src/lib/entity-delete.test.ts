import { beforeEach, describe, expect, it } from "vitest";

import {
  softDeleteBranch,
  softDeleteFlight,
  softDeleteNest,
  softDeleteWing,
} from "./entity-delete";
import { createBranch, createFlight, createNest, createWing } from "./entity-storage";
import { getNotesDb } from "./notes-db";
import { createNotesDirectoryEntry, listNotesDirectoryEntries } from "./notes-directory-storage";
import { createTwig, listTwigs } from "./twig-storage";
import { loadWorkspaceSnapshot } from "./workspace-storage";

const STORES = [
  "wings",
  "flights",
  "branches",
  "nests",
  "notes-directory",
  "notes-documents",
  "notes-media",
  "twigs",
  "pebbles",
] as const;

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all(STORES.map((store) => database.clear(store)));
});

/** A complete path with a note, a twig and an image, so a cascade has something to reach. */
async function seedWorkspace() {
  const wing = await createWing("My Wing");
  const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
  const branch = await createBranch({ flightId: flight.id, name: "Biology" });
  const nest = await createNest({ branchId: branch.id, name: "Unit 1" });
  const note = await createNotesDirectoryEntry({
    branchId: branch.id,
    feather: "Lecture",
    nestIds: [nest.id],
  });
  const twig = await createTwig({ branchId: branch.id, title: "Lab report" });

  const database = await getNotesDb();
  await database.put("notes-documents", {
    id: note.id,
    linearCompressed: null,
    linearCompressionAlgorithm: null,
    sceneCompressed: null,
    sceneCompressionAlgorithm: null,
    sceneFiles: [{ id: "media-1", mimeType: "image/webp", created: 1 }],
    updatedAt: 1,
  });
  await database.put("notes-media", {
    id: "media-1",
    blob: new Blob([new Uint8Array([1])], { type: "image/webp" }),
    mimeType: "image/webp",
    created: 1,
    updatedAt: 1,
  });

  return { wing, flight, branch, nest, note, twig };
}

describe("cascading deletes", () => {
  it("takes everything under a wing with it, and drops the bytes", async () => {
    const { wing, note } = await seedWorkspace();

    expect(await softDeleteWing(wing.id)).toEqual({
      flights: 1,
      branches: 1,
      nests: 1,
      notes: 1,
      twigs: 1,
      pebbles: 0,
    });

    const snapshot = await loadWorkspaceSnapshot();
    expect(snapshot).toEqual({ wings: [], flights: [], branches: [], nests: [] });
    expect(await listNotesDirectoryEntries()).toEqual([]);
    expect(await listTwigs()).toEqual([]);

    const database = await getNotesDb();
    expect(await database.get("notes-documents", note.id)).toBeUndefined();
    expect(await database.get("notes-media", "media-1")).toBeUndefined();
  });

  it("tombstones rather than removing, so a sync can tell deleted from never-created", async () => {
    const { wing, branch, note } = await seedWorkspace();

    await softDeleteWing(wing.id);

    const database = await getNotesDb();
    expect((await database.get("wings", wing.id))?.deletedAt).toEqual(expect.any(Number));
    expect((await database.get("branches", branch.id))?.deletedAt).toEqual(expect.any(Number));
    expect((await database.get("notes-directory", note.id))?.deletedAt).toEqual(expect.any(Number));
  });

  it("deleting a flight leaves its wing and the wing's other flights alone", async () => {
    const { wing, flight } = await seedWorkspace();
    const spared = await createFlight({ wingId: wing.id, name: "Spring 2027" });

    const summary = await softDeleteFlight(flight.id);

    expect(summary).toMatchObject({ flights: 1, branches: 1, notes: 1 });
    const snapshot = await loadWorkspaceSnapshot();
    expect(snapshot.wings.map((row) => row.id)).toEqual([wing.id]);
    expect(snapshot.flights.map((row) => row.id)).toEqual([spared.id]);
  });

  it("deleting a branch leaves its flight standing", async () => {
    const { flight, branch } = await seedWorkspace();

    expect(await softDeleteBranch(branch.id)).toMatchObject({ flights: 0, branches: 1, notes: 1 });

    const snapshot = await loadWorkspaceSnapshot();
    expect(snapshot.flights.map((row) => row.id)).toEqual([flight.id]);
    expect(snapshot.branches).toEqual([]);
  });

  it("keeps an image another branch's note still draws", async () => {
    const { branch } = await seedWorkspace();
    const otherFlight = await createFlight({ wingId: "other-wing", name: "Fall 2026" });
    const otherBranch = await createBranch({ flightId: otherFlight.id, name: "Art" });
    const otherNote = await createNotesDirectoryEntry({
      branchId: otherBranch.id,
      feather: "Sketch",
    });

    const database = await getNotesDb();
    await database.put("notes-documents", {
      id: otherNote.id,
      linearCompressed: null,
      linearCompressionAlgorithm: null,
      sceneCompressed: null,
      sceneCompressionAlgorithm: null,
      sceneFiles: [{ id: "media-1", mimeType: "image/webp", created: 1 }],
      updatedAt: 1,
    });

    await softDeleteBranch(branch.id);

    expect(await database.get("notes-media", "media-1")).toBeDefined();
  });

  it("reports nothing to do for an unknown id or something already deleted", async () => {
    const { wing, flight, branch } = await seedWorkspace();

    expect(await softDeleteWing("missing")).toBeNull();
    expect(await softDeleteFlight("missing")).toBeNull();
    expect(await softDeleteBranch("missing")).toBeNull();

    expect(await softDeleteBranch(branch.id)).not.toBeNull();
    expect(await softDeleteBranch(branch.id)).toBeNull();
    expect(await softDeleteFlight(flight.id)).not.toBeNull();
    expect(await softDeleteFlight(flight.id)).toBeNull();
    expect(await softDeleteWing(wing.id)).not.toBeNull();
    expect(await softDeleteWing(wing.id)).toBeNull();
  });

  it("leaves the bytes alone when the branch had no media to drop", async () => {
    const wing = await createWing("Bare");
    const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Empty" });

    expect(await softDeleteBranch(branch.id)).toEqual({
      flights: 0,
      branches: 1,
      nests: 0,
      notes: 0,
      twigs: 0,
      pebbles: 0,
    });
  });
});

describe("deleting a nest", () => {
  it("lifts the tag off what carried it instead of deleting it", async () => {
    const { nest, note, branch } = await seedWorkspace();
    const tagged = await createTwig({ branchId: branch.id, title: "Essay", nestIds: [nest.id] });

    expect(await softDeleteNest(nest.id)).toBe(true);

    const snapshot = await loadWorkspaceSnapshot();
    expect(snapshot.nests).toEqual([]);

    // The note and the task survive; only the tag is gone.
    const entries = await listNotesDirectoryEntries();
    expect(entries.map((entry) => entry.id)).toContain(note.id);
    expect(entries.find((entry) => entry.id === note.id)?.nestIds).toEqual([]);
    expect((await listTwigs()).find((twig) => twig.id === tagged.id)?.nestIds).toEqual([]);
  });

  it("lifts the tag off a pebble too, and keeps the file itself", async () => {
    const { nest, branch } = await seedWorkspace();
    const database = await getNotesDb();
    await database.put("pebbles", {
      id: "pebble-1",
      branchId: branch.id,
      nestIds: [nest.id, "other-nest"],
      name: "Handout",
      mimeType: "image/webp",
      size: 1,
      mediaId: "media-1",
      featherId: null,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    });

    await softDeleteNest(nest.id);

    const pebble = await database.get("pebbles", "pebble-1");
    expect(pebble).toMatchObject({ nestIds: ["other-nest"], deletedAt: null });
  });

  it("reports nothing to do for an unknown nest or one already deleted", async () => {
    const { nest } = await seedWorkspace();

    expect(await softDeleteNest("missing")).toBe(false);
    expect(await softDeleteNest(nest.id)).toBe(true);
    expect(await softDeleteNest(nest.id)).toBe(false);
  });
});
