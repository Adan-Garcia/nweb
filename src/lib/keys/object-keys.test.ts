// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createAesGcmCipher,
  getActiveCipher,
  resetActiveCipher,
  setActiveCipher,
} from "../crypto/cipher";
import { getNotesDb } from "../db/notes-db";
import { createBranch, createFlight, createNest, createWing } from "../hierarchy/entity-storage";
import {
  createNotesDirectoryEntry,
  listNotesDirectoryEntries,
  setNotesDirectoryEntryPlacement,
} from "../notes/notes-directory-storage";
import { createObjectKey, type Keyring, openKeyGraph, wrapForRecipient } from "./key-graph";
import {
  cipherForObject,
  currentKeyGraph,
  forgetKeyring,
  holdKeyring,
  keysNeedUpload,
  markKeysUploaded,
  provisionObjectKey,
  wrapUnderAlso,
} from "./object-keys";

/** A workspace with an account: a wing key in hand and an empty graph hung off it. */
async function withWingKey() {
  const wing = await createObjectKey("wing");
  const keyring: Keyring = new Map([[wing.keyId, wing.key]]);

  setActiveCipher(createAesGcmCipher(wing.key, wing.keyId));
  holdKeyring(keyring, {
    keys: [{ id: wing.keyId, kind: "wing", rotatedFrom: null }],
    wraps: [],
    grants: [],
  });

  // The same map the module holds, so a test can reach a minted key to share it.
  return { ...wing, keyring };
}

async function identity() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["wrapKey", "unwrapKey"],
  );

  return {
    privateKey: pair.privateKey,
    publicKey: btoa(
      String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey))),
    ),
  };
}

async function clearStores() {
  const database = await getNotesDb();

  for (const store of [
    "wings",
    "flights",
    "branches",
    "nests",
    "notes-directory",
    "notes-documents",
  ] as const) {
    await database.clear(store);
  }
}

beforeEach(clearStores);

afterEach(async () => {
  forgetKeyring();
  resetActiveCipher();
  await clearStores();
});

describe("a workspace with no account", () => {
  it("writes everything with the one key it has, as it always did", async () => {
    const plain = createAesGcmCipher(
      await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
        "encrypt",
        "decrypt",
      ]),
      "the-only-key",
    );

    setActiveCipher(plain);

    const wing = await createWing("My wing");
    const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Thermodynamics" });
    const database = await getNotesDb();

    // Sharing needs an account, so keys that exist to make sharing possible need one too.
    expect((await database.get("branches", branch.id))?.keyId).toBe("the-only-key");
  });

  it("mints nothing, so there is nothing to upload", async () => {
    expect(currentKeyGraph()).toBeNull();
    expect(keysNeedUpload()).toBe(false);
    expect(await provisionObjectKey("branch", [])).toBe(getActiveCipher());
  });
});

describe("a workspace with an account", () => {
  it("gives each level a key of its own, hung under the one above", async () => {
    const wing = await withWingKey();
    const database = await getNotesDb();

    const wingRow = await createWing("My wing");
    const flight = await createFlight({ wingId: wingRow.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Thermodynamics" });

    const flightKey = (await database.get("flights", flight.id))?.keyId;
    const branchKey = (await database.get("branches", branch.id))?.keyId;
    const graph = currentKeyGraph();

    expect(flightKey).not.toBe(wing.keyId);
    expect(branchKey).not.toBe(flightKey);
    expect(graph?.wraps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parentKeyId: wing.keyId, childKeyId: flightKey }),
        expect.objectContaining({ parentKeyId: flightKey, childKeyId: branchKey }),
      ]),
    );
  });

  it("wraps a note under its course and under every tag it carries", async () => {
    await withWingKey();
    const database = await getNotesDb();

    const wingRow = await createWing("My wing");
    const flight = await createFlight({ wingId: wingRow.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Thermodynamics" });
    const first = await createNest({ branchId: branch.id, name: "Unit 1" });
    const second = await createNest({ branchId: branch.id, name: "Problem sets" });

    const note = await createNotesDirectoryEntry({
      branchId: branch.id,
      feather: "Entropy",
      nestIds: [first.id, second.id],
    });

    const noteKey = (await database.get("notes-directory", note.id))?.keyId;
    const parents = (currentKeyGraph()?.wraps ?? [])
      .filter((wrap) => wrap.childKeyId === noteKey)
      .map((wrap) => wrap.parentKeyId);

    // A nest is a tag, so either route has to be enough to reach the note.
    expect(parents).toHaveLength(3);
    expect(parents).toContain((await database.get("branches", branch.id))?.keyId);
    expect(parents).toContain((await database.get("nests", first.id))?.keyId);
  });

  it("hands a course over without handing over its neighbours", async () => {
    const { keyring } = await withWingKey();
    const database = await getNotesDb();
    const friend = await identity();

    const wingRow = await createWing("My wing");
    const flight = await createFlight({ wingId: wingRow.id, name: "Fall 2026" });
    const shared = await createBranch({ flightId: flight.id, name: "Thermodynamics" });
    const other = await createBranch({ flightId: flight.id, name: "Poetry" });

    const sharedNote = await createNotesDirectoryEntry({
      branchId: shared.id,
      feather: "Entropy",
    });
    const otherNote = await createNotesDirectoryEntry({ branchId: other.id, feather: "Ode" });

    const keyOf = async (store: "branches" | "notes-directory", id: string) =>
      (await database.get(store, id))?.keyId ?? "";
    const sharedKeyId = await keyOf("branches", shared.id);

    // Exactly what sharing that one course does: its key, sealed for the recipient.
    const theirs = await openKeyGraph(
      {
        ...currentKeyGraph()!,
        grants: [
          {
            keyId: sharedKeyId,
            role: "reader",
            wrapped: await wrapForRecipient(keyring.get(sharedKeyId)!, friend.publicKey),
          },
        ],
      },
      friend.privateKey,
    );

    expect(theirs.has(sharedKeyId)).toBe(true);
    expect(theirs.has(await keyOf("notes-directory", sharedNote.id))).toBe(true);

    // The course next to it, and the note in that course, stay shut — even though every
    // wrap that mentions them was in the graph they were handed.
    expect(theirs.has(await keyOf("branches", other.id))).toBe(false);
    expect(theirs.has(await keyOf("notes-directory", otherNote.id))).toBe(false);
  });

  it("hands one note over with no route to anything around it", async () => {
    const { keyring } = await withWingKey();
    const database = await getNotesDb();
    const friend = await identity();

    const wingRow = await createWing("My wing");
    const flight = await createFlight({ wingId: wingRow.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Thermodynamics" });
    const note = await createNotesDirectoryEntry({ branchId: branch.id, feather: "Entropy" });

    const noteKeyId = (await database.get("notes-directory", note.id))?.keyId ?? "";

    const theirs = await openKeyGraph(
      {
        ...currentKeyGraph()!,
        grants: [
          {
            keyId: noteKeyId,
            role: "reader",
            wrapped: await wrapForRecipient(keyring.get(noteKeyId)!, friend.publicKey),
          },
        ],
      },
      friend.privateKey,
    );

    // A note shared on its own arrives with no path, because the path is names under keys
    // the recipient does not hold.
    expect([...theirs.keys()]).toEqual([noteKeyId]);
  });

  it("opens a note it wrote back again", async () => {
    await withWingKey();

    const wingRow = await createWing("My wing");
    const flight = await createFlight({ wingId: wingRow.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Thermodynamics" });

    await createNotesDirectoryEntry({ branchId: branch.id, feather: "Entropy" });

    // Every key is registered as it is minted, and a list resolves each row by the key it
    // carries — the rows in one list are no longer all on one key.
    expect((await listNotesDirectoryEntries())[0]?.feather).toBe("Entropy");
  });

  it("hangs a note's key under a tag added later", async () => {
    await withWingKey();
    const database = await getNotesDb();

    const wingRow = await createWing("My wing");
    const flight = await createFlight({ wingId: wingRow.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Thermodynamics" });
    const nest = await createNest({ branchId: branch.id, name: "Unit 1" });
    const note = await createNotesDirectoryEntry({ branchId: branch.id, feather: "Entropy" });

    await setNotesDirectoryEntryPlacement(note.id, { nestIds: [nest.id] });

    const noteKey = (await database.get("notes-directory", note.id))?.keyId;
    const nestKey = (await database.get("nests", nest.id))?.keyId;

    // Without this the tag would be shareable and lead nowhere.
    expect(currentKeyGraph()?.wraps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parentKeyId: nestKey, childKeyId: noteKey }),
      ]),
    );
  });

  it("does not wrap the same edge twice", async () => {
    await withWingKey();
    const database = await getNotesDb();

    const wingRow = await createWing("My wing");
    const flight = await createFlight({ wingId: wingRow.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Thermodynamics" });
    const note = await createNotesDirectoryEntry({ branchId: branch.id, feather: "Entropy" });

    const before = currentKeyGraph()?.wraps.length ?? 0;

    // The note is already under its course, so re-saving its placement changes nothing.
    await setNotesDirectoryEntryPlacement(note.id, { branchId: branch.id });

    expect(currentKeyGraph()?.wraps).toHaveLength(before);
    expect((await database.get("notes-directory", note.id))?.keyId).toBeTruthy();
  });

  it("has something to upload the moment it mints a key", async () => {
    const wing = await withWingKey();

    markKeysUploaded();
    expect(keysNeedUpload()).toBe(false);

    await provisionObjectKey("branch", [wing.keyId]);

    expect(keysNeedUpload()).toBe(true);
  });

  it("falls back to the active cipher for a parent it cannot derive", async () => {
    await withWingKey();

    // A key id that is not in the keyring is not a parent this device can wrap under.
    expect(await provisionObjectKey("branch", ["a-key-nobody-gave-me"])).toBe(getActiveCipher());
  });

  it("hangs nothing under a parent or child it cannot reach", async () => {
    const { keyring, keyId } = await withWingKey();
    const before = currentKeyGraph()?.wraps.length ?? 0;

    // Each guard in turn: no child, no parent, and neither.
    await wrapUnderAlso("a-key-nobody-gave-me", keyId);
    await wrapUnderAlso(keyId, "a-key-nobody-gave-me");
    await wrapUnderAlso(null, null);
    await wrapUnderAlso(undefined, undefined);

    expect(currentKeyGraph()?.wraps).toHaveLength(before);
    expect(keyring.size).toBe(1);
  });

  it("hangs nothing at all once the keys are forgotten", async () => {
    const { keyId } = await withWingKey();

    forgetKeyring();
    await wrapUnderAlso(keyId, keyId);

    expect(currentKeyGraph()).toBeNull();
  });

  it("falls back for an object named by nothing", async () => {
    await withWingKey();

    expect(cipherForObject(null)).toBe(getActiveCipher());
    expect(cipherForObject(undefined)).toBe(getActiveCipher());
    expect(cipherForObject("a-key-nobody-gave-me")).toBe(getActiveCipher());
  });

  it("forgets every key when the account is forgotten", async () => {
    const wing = await withWingKey();

    forgetKeyring();

    expect(currentKeyGraph()).toBeNull();
    expect(cipherForObject(wing.keyId)).toBe(getActiveCipher());
  });
});
