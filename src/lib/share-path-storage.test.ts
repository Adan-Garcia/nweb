// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "./cipher";
import { createBranch, createFlight, createNest, createWing, renameBranch } from "./entity-storage";
import { createObjectKey } from "./keys/key-graph";
import { currentKeyGraph, forgetKeyring, heldKeyring, holdKeyring } from "./keys/object-keys";
import { getNotesDb } from "./notes-db";
import { createNotesDirectoryEntry } from "./notes-directory-storage";
import { listSharePathEntities, refreshSharePaths, writeSharePath } from "./share-path-storage";

const STORES = ["wings", "flights", "branches", "nests", "notes-directory", "share-paths"] as const;

async function clearStores() {
  const database = await getNotesDb();

  for (const store of STORES) {
    await database.clear(store);
  }
}

/** An account's workspace: a wing key in hand, a course with a tag, and one note in it. */
async function workspace() {
  const wingKey = await createObjectKey("wing");

  setActiveCipher(createAesGcmCipher(wingKey.key, wingKey.keyId));
  holdKeyring(new Map([[wingKey.keyId, wingKey.key]]), {
    keys: [],
    wraps: [],
    grants: [{ keyId: wingKey.keyId, role: "writer", wrapped: "g" }],
  });

  const wing = await createWing("Adan's wing");
  const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
  const branch = await createBranch({ flightId: flight.id, name: "Thermodynamics" });
  const sibling = await createBranch({ flightId: flight.id, name: "Poetry" });
  const nest = await createNest({ branchId: branch.id, name: "Unit 1" });
  const note = await createNotesDirectoryEntry({
    branchId: branch.id,
    feather: "Entropy",
    nestIds: [nest.id],
  });
  const database = await getNotesDb();
  const keyOf = async (store: "flights" | "branches" | "nests" | "notes-directory", id: string) =>
    (await database.get(store, id))?.keyId ?? "";

  return {
    wing,
    flight,
    branch,
    sibling,
    nest,
    note,
    keys: {
      flight: await keyOf("flights", flight.id),
      branch: await keyOf("branches", branch.id),
      nest: await keyOf("nests", nest.id),
      note: await keyOf("notes-directory", note.id),
    },
  };
}

beforeEach(clearStores);

afterEach(async () => {
  forgetKeyring();
  resetActiveCipher();
  await clearStores();
});

describe("writeSharePath", () => {
  it("records the names above a note — course, term, wing and its tags — and nothing beside", async () => {
    const { keys, note, branch, flight, wing, nest } = await workspace();

    expect(await writeSharePath(keys.note)).toBe(true);

    const path = await listSharePathEntities();

    expect(path.branches.map((row) => row.name)).toEqual(["Thermodynamics"]);
    expect(path.flights.map((row) => row.name)).toEqual(["Fall 2026"]);
    expect(path.wings.map((row) => row.name)).toEqual(["Adan's wing"]);
    expect(path.nests.map((row) => row.name)).toEqual(["Unit 1"]);
    expect(path.branches[0]).toMatchObject({ id: branch.id, flightId: flight.id });
    expect(path.flights[0].wingId).toBe(wing.id);
    expect(path.nests[0].branchId).toBe(branch.id);

    // Sealed under the note's own key, so exactly the people who can read it read this.
    const record = await (await getNotesDb()).get("share-paths", note.id);

    expect(record).toMatchObject({ kind: "feather", keyId: keys.note, encryption: "aes-gcm" });
    expect(record?.path).not.toContain("Thermodynamics");
    expect(record?.path).not.toContain(nest.name);
  });

  it("records the levels above a course, a tag and a term", async () => {
    const { keys, branch, flight, nest } = await workspace();
    const database = await getNotesDb();

    expect(await writeSharePath(keys.branch)).toBe(true);
    expect(await writeSharePath(keys.nest)).toBe(true);
    expect(await writeSharePath(keys.flight)).toBe(true);

    expect((await database.get("share-paths", branch.id))?.kind).toBe("branch");
    expect((await database.get("share-paths", nest.id))?.kind).toBe("nest");
    expect((await database.get("share-paths", flight.id))?.kind).toBe("flight");

    const path = await listSharePathEntities();

    // One wing reached three ways is one wing.
    expect(path.wings).toHaveLength(1);
    expect(path.flights).toHaveLength(1);
    expect(path.branches).toHaveLength(1);
  });

  it("writes nothing when the path has not changed, and rewrites it after a rename", async () => {
    const { keys, branch } = await workspace();

    await writeSharePath(keys.note);

    expect(await writeSharePath(keys.note)).toBe(false);

    await renameBranch(branch.id, "Heat");

    expect(await writeSharePath(keys.note)).toBe(true);
    expect((await listSharePathEntities()).branches[0].name).toBe("Heat");
  });

  it("never writes a path it cannot see to the top of", async () => {
    const { keys, flight } = await workspace();
    const database = await getNotesDb();

    // What a recipient of the course alone would see: the course, with no term above it.
    await database.delete("flights", flight.id);

    expect(await writeSharePath(keys.branch)).toBe(false);
    expect(await writeSharePath(keys.note)).toBe(false);
    expect(await database.count("share-paths")).toBe(0);
  });

  it("stops at a course that is not here", async () => {
    const { keys, branch } = await workspace();

    await (await getNotesDb()).delete("branches", branch.id);

    expect(await writeSharePath(keys.nest)).toBe(false);
  });

  it("writes nothing for a key on no row, or one this device does not hold", async () => {
    const { note } = await workspace();
    const database = await getNotesDb();
    const stored = await database.get("notes-directory", note.id);

    expect(await writeSharePath("no-such-key")).toBe(false);

    await database.put("notes-directory", { ...stored!, keyId: "not-held" });

    expect(await writeSharePath("not-held")).toBe(false);
  });
});

describe("refreshSharePaths", () => {
  it("brings every recorded path up to date after a rename", async () => {
    const { keys, branch } = await workspace();

    await writeSharePath(keys.note);
    await writeSharePath(keys.branch);
    await renameBranch(branch.id, "Heat");

    // The note's path names the course; the course's path does not name itself.
    expect(await refreshSharePaths()).toBe(1);
    expect((await listSharePathEntities()).branches[0].name).toBe("Heat");
  });

  it("leaves a path alone where this account may only read", async () => {
    const { keys, branch } = await workspace();

    await writeSharePath(keys.note);
    await renameBranch(branch.id, "Heat");

    // The same keys, reached through a reader grant: somebody else's wing, shared to read.
    const graph = currentKeyGraph()!;

    holdKeyring(heldKeyring()!, {
      ...graph,
      grants: graph.grants.map((grant) => ({ ...grant, role: "reader" as const })),
    });

    expect(await refreshSharePaths()).toBe(0);
  });
});

describe("listSharePathEntities", () => {
  it("skips a deleted record and one that cannot be read", async () => {
    const { keys, note, branch } = await workspace();
    const database = await getNotesDb();

    await writeSharePath(keys.note);
    await writeSharePath(keys.branch);

    const noteRecord = await database.get("share-paths", note.id);
    const branchRecord = await database.get("share-paths", branch.id);

    await database.put("share-paths", { ...noteRecord!, deletedAt: 5 });
    await database.put("share-paths", { ...branchRecord!, path: "garbage" });

    expect(await listSharePathEntities()).toEqual({
      wings: [],
      flights: [],
      branches: [],
      nests: [],
    });
  });
});
