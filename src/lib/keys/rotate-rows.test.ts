// @vitest-environment node
//
// Node, not jsdom: rotation reads media back out of stored Blobs, and fake-indexeddb
// flattens a jsdom Blob into a bare object with no arrayBuffer(). Node's Blob survives.
import { afterEach, describe, expect, it } from "vitest";

import {
  type Cipher,
  createAesGcmCipher,
  plaintextCipher,
  registerCipher,
  resetActiveCipher,
  setActiveCipher,
} from "../cipher";
import {
  createBranch,
  createFlight,
  createNest,
  createWing,
  listBranches,
} from "../entity-storage";
import { getNotesDb } from "../notes-db";
import { createNotesDirectoryEntry, listNotesDirectoryEntries } from "../notes-directory-storage";
import {
  loadNotesDocument,
  saveLinearDocumentPayload,
  saveSpatialDocumentPayload,
} from "../notes-document-storage";
import { buildEmptyDocument } from "../notes-model";
import { createPebble, listPebbles } from "../pebble-storage";
import { openText, sealRow } from "../sealed-text";
import { sharePathRecordSchema } from "../share-path-model";
import { createTwig, listTwigs } from "../twig-storage";
import { rotateRowsToKey } from "./rotate-rows";

const PATH_RECORD = { id: "note-1", kind: "feather", path: "{}", updatedAt: 1, deletedAt: null };

async function cipherWithId(keyId: string): Promise<Cipher> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);

  return createAesGcmCipher(key, keyId);
}

afterEach(async () => {
  resetActiveCipher();

  const database = await getNotesDb();

  for (const store of [
    "notes-documents",
    "notes-media",
    "notes-directory",
    "wings",
    "flights",
    "branches",
    "nests",
    "twigs",
    "pebbles",
    "share-paths",
  ] as const) {
    await database.clear(store);
  }
});

describe("rotateRowsToKey", () => {
  it("moves the rows one key sealed onto the new one", async () => {
    const old = await cipherWithId("old-key");
    const next = await cipherWithId("new-key");

    setActiveCipher(old);
    const branch = await createBranch({ flightId: "flight-1", name: "Thermodynamics" });
    await createNotesDirectoryEntry({ branchId: branch.id, feather: "Entropy" });
    await saveLinearDocumentPayload({
      documentId: "doc-1",
      compressionAlgorithm: "none",
      compressed: new TextEncoder().encode("the note"),
    });

    const summary = await rotateRowsToKey(old, next);

    expect(summary.documents).toBe(1);
    // The course name and the note's title each carry a sealed name, in different stores
    // and under different field names.
    expect(summary.names).toBe(2);

    const database = await getNotesDb();
    const stored = await database.get("notes-documents", "doc-1");

    expect(stored?.keyId).toBe("new-key");
  });

  it("leaves rows under another key exactly where they are", async () => {
    const mine = await cipherWithId("my-key");
    const theirs = await cipherWithId("a-shared-course");
    const next = await cipherWithId("my-new-key");

    setActiveCipher(mine);
    await saveLinearDocumentPayload({
      documentId: "mine",
      compressionAlgorithm: "none",
      compressed: new TextEncoder().encode("my note"),
    });

    setActiveCipher(theirs);
    await saveLinearDocumentPayload({
      documentId: "theirs",
      compressionAlgorithm: "none",
      compressed: new TextEncoder().encode("their note"),
    });

    setActiveCipher(mine);
    registerCipher(theirs);
    await rotateRowsToKey(mine, next);

    const database = await getNotesDb();

    // A row under a key that is not being rotated is not stale — it is somebody else's
    // course, and rewriting it here would seal it with a key they do not have.
    expect((await database.get("notes-documents", "theirs"))?.keyId).toBe("a-shared-course");
    expect((await database.get("notes-documents", "mine"))?.keyId).toBe("my-new-key");
  });

  it("leaves the content readable through the new key", async () => {
    const old = await cipherWithId("old-key");
    const next = await cipherWithId("new-key");

    setActiveCipher(old);
    const branch = await createBranch({ flightId: "flight-1", name: "Thermodynamics" });
    await createNotesDirectoryEntry({ branchId: branch.id, feather: "Entropy" });
    await saveLinearDocumentPayload({
      documentId: "doc-1",
      compressionAlgorithm: "none",
      compressed: new TextEncoder().encode("the note"),
    });

    await rotateRowsToKey(old, next);

    // The old key is gone from this device, as it would be after a rotation.
    resetActiveCipher();
    setActiveCipher(next);

    const loaded = await loadNotesDocument("doc-1");

    expect(new TextDecoder().decode(loaded?.document.linearCompressed ?? new Uint8Array())).toBe(
      "the note",
    );
    expect((await listBranches())[0]?.name).toBe("Thermodynamics");
    expect((await listNotesDirectoryEntries())[0]?.feather).toBe("Entropy");
  });

  it("moves stored media too, and keeps the type it will open as", async () => {
    const old = await cipherWithId("old-key");
    const next = await cipherWithId("new-key");
    const database = await getNotesDb();

    setActiveCipher(old);
    await database.put("notes-media", {
      id: "media-1",
      blob: new Blob([Uint8Array.from(await old.encrypt(new TextEncoder().encode("bytes")))]),
      mimeType: "image/png",
      created: Date.now(),
      updatedAt: Date.now(),
      encryption: "aes-gcm",
      keyId: "old-key",
    });

    const summary = await rotateRowsToKey(old, next);
    const stored = await database.get("notes-media", "media-1");

    expect(summary.media).toBe(1);
    expect(stored?.keyId).toBe("new-key");
    expect(stored?.mimeType).toBe("image/png");
    expect(
      new TextDecoder().decode(
        await next.decrypt(new Uint8Array(await stored!.blob.arrayBuffer())),
      ),
    ).toBe("bytes");
  });

  it("reaches every store that carries a name", async () => {
    const old = await cipherWithId("old-key");
    const next = await cipherWithId("new-key");

    setActiveCipher(old);

    const wing = await createWing("My wing");
    const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
    const branch = await createBranch({ flightId: flight.id, name: "Thermodynamics" });
    const nest = await createNest({ branchId: branch.id, name: "Unit 1" });

    await createNotesDirectoryEntry({ branchId: branch.id, feather: "Entropy" });
    await createTwig({ branchId: branch.id, title: "Problem set 3" });
    await createPebble({
      branchId: branch.id,
      name: "lecture.pdf",
      blob: new Blob([new Uint8Array([1, 2, 3])]),
    });

    // A wing, a flight, a course, a tag, a note title, a task title and a file name: every
    // store that carries the one field a row is listed by.
    expect((await rotateRowsToKey(old, next)).names).toBe(7);

    resetActiveCipher();
    setActiveCipher(next);

    expect((await listBranches())[0]?.name).toBe("Thermodynamics");
    expect((await listTwigs())[0]?.title).toBe("Problem set 3");
    expect((await listPebbles())[0]?.name).toBe("lecture.pdf");
    expect((await listNotesDirectoryEntries())[0]?.feather).toBe("Entropy");
    expect(nest.name).toBe("Unit 1");
  });

  it("moves the path above a shared thing with the key it is sealed under", async () => {
    const old = await cipherWithId("old-key");
    const next = await cipherWithId("new-key");
    const database = await getNotesDb();

    await database.put(
      "share-paths",
      await sealRow(sharePathRecordSchema.parse(PATH_RECORD), "path", old),
    );

    expect((await rotateRowsToKey(old, next)).names).toBe(1);

    const moved = await database.get("share-paths", "note-1");

    expect(moved?.keyId).toBe("new-key");
    expect(await openText(moved!.path, moved!, next)).toBe("{}");
  });

  it("can put a workspace back in the clear", async () => {
    const old = await cipherWithId("old-key");
    const database = await getNotesDb();

    setActiveCipher(old);
    await createBranch({ flightId: "flight-1", name: "Thermodynamics" });
    await saveSpatialDocumentPayload({
      documentId: "doc-1",
      compressionAlgorithm: "none",
      compressed: new TextEncoder().encode("the drawing"),
      files: [
        {
          id: "file-1",
          blob: new Blob([new Uint8Array([4, 5, 6])]),
          mimeType: "image/png",
          created: Date.now(),
        },
      ],
    });

    await rotateRowsToKey(old, plaintextCipher);

    const document = await database.get("notes-documents", "doc-1");
    const media = await database.get("notes-media", "file-1");

    // Back in the clear: no marker, no id, and a blob that carries its own type again.
    expect(document?.encryption).toBe("none");
    expect(document?.keyId).toBeUndefined();
    expect(media?.blob.type).toBe("image/png");
    expect(new TextDecoder().decode(document?.sceneCompressed ?? new Uint8Array())).toBe(
      "the drawing",
    );
  });

  it("leaves a document that holds neither payload alone but still stamps it", async () => {
    const old = await cipherWithId("old-key");
    const next = await cipherWithId("new-key");
    const database = await getNotesDb();

    await database.put("notes-documents", {
      ...buildEmptyDocument("empty"),
      encryption: "aes-gcm",
      keyId: "old-key",
    });

    expect((await rotateRowsToKey(old, next)).documents).toBe(1);

    const stored = await database.get("notes-documents", "empty");

    expect(stored).toMatchObject({
      keyId: "new-key",
      linearCompressed: null,
      sceneCompressed: null,
    });
  });

  it("counts nothing when no row carries the key", async () => {
    const unused = await cipherWithId("never-used");
    const next = await cipherWithId("new-key");

    setActiveCipher(await cipherWithId("my-key"));
    await saveLinearDocumentPayload({
      documentId: "doc-1",
      compressionAlgorithm: "none",
      compressed: new TextEncoder().encode("the note"),
    });

    expect(await rotateRowsToKey(unused, next)).toEqual({ documents: 0, media: 0, names: 0 });
  });
});
