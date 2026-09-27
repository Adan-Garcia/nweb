import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "../crypto/cipher";
import { getNotesDb } from "../db/notes-db";
import { createBranch, createFlight, createNest, createWing } from "../hierarchy/entity-storage";
import { createNotesDirectoryEntry } from "../notes/notes-directory-storage";
import { createObjectKey, type Keyring } from "./key-graph";
import { forgetKeyring, holdKeyring } from "./object-keys";
import { KIND_LABELS, listShareable } from "./shareable";

async function withWingKey() {
  const wing = await createObjectKey("wing");
  const keyring: Keyring = new Map([[wing.keyId, wing.key]]);

  setActiveCipher(createAesGcmCipher(wing.key, wing.keyId));
  holdKeyring(keyring, {
    keys: [{ id: wing.keyId, kind: "wing", rotatedFrom: null }],
    wraps: [],
    grants: [],
  });
}

async function clearStores() {
  const database = await getNotesDb();

  for (const store of ["wings", "flights", "branches", "nests", "notes-directory"] as const) {
    await database.clear(store);
  }
}

async function seed() {
  const wing = await createWing("My wing");
  const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
  const branch = await createBranch({ flightId: flight.id, name: "Thermodynamics" });
  const nest = await createNest({ branchId: branch.id, name: "Unit 1" });
  const note = await createNotesDirectoryEntry({
    branchId: branch.id,
    feather: "Entropy",
    nestIds: [nest.id],
  });

  return { branch, nest, note };
}

beforeEach(clearStores);

afterEach(async () => {
  forgetKeyring();
  resetActiveCipher();
  await clearStores();
});

describe("listShareable", () => {
  it("is empty in a workspace where nothing has a key of its own", async () => {
    await seed();

    // No account: there is nobody to share with and nothing to seal it for them.
    expect(await listShareable()).toEqual([]);
  });

  it("lists a course, a tag and a note together", async () => {
    await withWingKey();
    await seed();

    const shareable = await listShareable();

    // Sharing is not a level in the hierarchy: it is any object that has a key.
    expect(shareable.map((thing) => thing.kind).sort()).toEqual(["branch", "feather", "nest"]);
  });

  it("says what a tag and a note sit in, and what a course does not", async () => {
    await withWingKey();
    await seed();

    const shareable = await listShareable();
    const within = (kind: string) => shareable.find((thing) => thing.kind === kind)?.within;

    expect(within("nest")).toBe("Thermodynamics");
    expect(within("feather")).toBe("Thermodynamics");
    // A course sits in a term, which is not shareable and would only be noise here.
    expect(within("branch")).toBeNull();
  });

  it("leaves out anything that has been deleted", async () => {
    await withWingKey();
    const { branch, nest, note } = await seed();
    const database = await getNotesDb();

    for (const [store, id] of [
      ["branches", branch.id],
      ["nests", nest.id],
      ["notes-directory", note.id],
    ] as const) {
      const row = await database.get(store, id);

      await database.put(store, { ...row!, deletedAt: Date.now() });
    }

    expect(await listShareable()).toEqual([]);
  });

  it("skips a row whose name it cannot open rather than failing the whole list", async () => {
    await withWingKey();
    const { branch } = await seed();
    const database = await getNotesDb();
    const stored = await database.get("branches", branch.id);

    // A course from somebody else's workspace, whose key this device was never given.
    await database.put("branches", { ...stored!, id: "theirs", keyId: "a-key-nobody-gave-me" });

    const shareable = await listShareable();

    expect(shareable.map((thing) => thing.keyId)).not.toContain("a-key-nobody-gave-me");
    expect(shareable.some((thing) => thing.name === "Thermodynamics")).toBe(true);
  });

  it("names a tag whose course it cannot read without pretending to know it", async () => {
    await withWingKey();
    const { nest } = await seed();
    const database = await getNotesDb();
    const stored = await database.get("nests", nest.id);

    await database.put("nests", { ...stored!, branchId: "a-course-that-is-not-here" });

    const listed = (await listShareable()).find((thing) => thing.kind === "nest");

    expect(listed?.name).toBe("Unit 1");
    expect(listed?.within).toBeNull();
  });
});

describe("KIND_LABELS", () => {
  it("gives every kind a plain-language name", () => {
    // The domain vocabulary lives in identifiers; a screen says "Course", not "Branch".
    expect(KIND_LABELS.branch).toBe("Course");
    expect(KIND_LABELS.nest).toBe("Tag");
    expect(KIND_LABELS.feather).toBe("Note");
    expect(Object.values(KIND_LABELS).every(Boolean)).toBe(true);
  });
});
