// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import { type Cipher, createAesGcmCipher, decryptWith, plaintextCipher } from "../crypto/cipher";
import { openText, sealText } from "../crypto/sealed-text";
import { createObjectKey } from "../keys/key-graph";
import { forgetKeyring, holdKeyring } from "../keys/object-keys";
import { compressText, decompressText } from "../media/text-compression";
import { mergeStoredRows, type StoredRecord } from "./merge-row";

afterEach(() => {
  forgetKeyring();
});

/** A note's key held the way an unlocked account holds it. */
async function holdNoteKey(): Promise<Cipher> {
  const note = await createObjectKey("feather");

  holdKeyring(new Map([[note.keyId, note.key]]), { keys: [], wraps: [], grants: [] });

  return createAesGcmCipher(note.key, note.keyId);
}

async function document(
  cipher: Cipher,
  body: { linear?: string; scene?: string; files?: string[] },
): Promise<StoredRecord> {
  const seal = async (text: string | undefined) => {
    if (text === undefined) {
      return { bytes: null, algorithm: null };
    }

    const compressed = await compressText(text);

    return {
      bytes: await cipher.encrypt(new Uint8Array(compressed.buffer)),
      algorithm: compressed.algorithm,
    };
  };
  const linear = await seal(body.linear);
  const scene = await seal(body.scene);

  return {
    id: "note-1",
    linearCompressed: linear.bytes,
    linearCompressionAlgorithm: linear.algorithm,
    sceneCompressed: scene.bytes,
    sceneCompressionAlgorithm: scene.algorithm,
    sceneFiles: (body.files ?? []).map((id) => ({ id, mimeType: "image/png", created: 1 })),
    updatedAt: 1,
    encryption: cipher.name,
    keyId: cipher.keyId || undefined,
  };
}

async function openBody(row: StoredRecord, prefix: "linear" | "scene") {
  const bytes = row[`${prefix}Compressed`];
  const algorithm = row[`${prefix}CompressionAlgorithm`];

  if (!(bytes instanceof Uint8Array) || typeof algorithm !== "string") {
    return null;
  }

  const marker = { encryption: plaintextCipher.name, keyId: undefined };
  const opened =
    row.encryption === "aes-gcm"
      ? await decryptWith(bytes, { encryption: "aes-gcm", keyId: String(row.keyId) })
      : await decryptWith(bytes, marker);

  return decompressText(opened.slice().buffer, algorithm);
}

const scene = (ids: string[]) =>
  JSON.stringify({ elements: ids.map((id) => ({ id, version: 1 })) });

describe("mergeStoredRows — documents", () => {
  it("merges the text and the canvas of one note, sealed back under the note's own key", async () => {
    const cipher = await holdNoteKey();
    const base = await document(cipher, { linear: "<p>a</p><p>b</p>", scene: scene(["x"]) });
    const local = await document(cipher, {
      linear: "<p>A</p><p>b</p>",
      scene: scene(["x", "mine"]),
      files: ["img-1"],
    });
    const remote = await document(cipher, {
      linear: "<p>a</p><p>B</p>",
      scene: scene(["x", "theirs"]),
      files: ["img-2", "img-1"],
    });

    const merged = await mergeStoredRows("notes-documents", { base, local, remote }, "remote");

    expect(merged?.keyId).toBe(cipher.keyId);
    expect(merged?.encryption).toBe("aes-gcm");
    expect(await openBody(merged!, "linear")).toBe("<p>A</p><p>B</p>");
    expect(JSON.parse((await openBody(merged!, "scene"))!)).toMatchObject({
      elements: [{ id: "x" }, { id: "mine" }, { id: "theirs" }],
    });
    expect((merged?.sceneFiles as { id: string }[]).map((file) => file.id).sort()).toEqual([
      "img-1",
      "img-2",
    ]);
  });

  it("takes whichever side has a body when the other has none", async () => {
    const local = await document(plaintextCipher, {});
    const remote = await document(plaintextCipher, { linear: "<p>new</p>" });

    const merged = await mergeStoredRows("notes-documents", { base: null, local, remote }, "local");

    expect(await openBody(merged!, "linear")).toBe("<p>new</p>");
    expect(merged?.sceneCompressed).toBeNull();
    expect(merged?.encryption).toBe("none");
    expect(merged?.keyId).toBeUndefined();
  });

  it("reads a scene file list that does not parse as none", async () => {
    const local = { ...(await document(plaintextCipher, {})), sceneFiles: "junk" };
    const remote = await document(plaintextCipher, { files: ["img-1"] });

    const merged = await mergeStoredRows("notes-documents", { base: null, local, remote }, "local");

    expect(merged?.sceneFiles).toEqual([{ id: "img-1", mimeType: "image/png", created: 1 }]);
  });

  it("merges against an empty base when the base had no text yet", async () => {
    const base = await document(plaintextCipher, {});
    const local = await document(plaintextCipher, { linear: "<p>L</p>" });
    const remote = await document(plaintextCipher, { linear: "<p>R</p>" });

    const merged = await mergeStoredRows("notes-documents", { base, local, remote }, "remote");

    expect(await openBody(merged!, "linear")).toBe("<p>R</p>");
  });

  it("refuses to merge under a key this device does not hold", async () => {
    const stranger = await createObjectKey("feather");
    const cipher = createAesGcmCipher(stranger.key, stranger.keyId);
    const row = await document(cipher, { linear: "<p>a</p>" });

    // Falling back to this workspace's own key would re-seal somebody else's note under a
    // key they do not have — which is exactly what must never happen.
    expect(
      await mergeStoredRows("notes-documents", { base: null, local: row, remote: row }, "local"),
    ).toBeNull();
  });

  it("gives up rather than guess when a side cannot be opened", async () => {
    const cipher = await holdNoteKey();
    const local = await document(cipher, { linear: "<p>a</p>" });
    const remote = { ...local, linearCompressed: new Uint8Array([1, 2, 3]) };

    expect(
      await mergeStoredRows("notes-documents", { base: null, local, remote }, "local"),
    ).toBeNull();
  });
});

describe("mergeStoredRows — named rows", () => {
  it("keeps a rename from one side and a re-tag from the other, the title sealed again", async () => {
    const cipher = await holdNoteKey();
    const row = async (feather: string, nestIds: string[], updatedAt: number) => ({
      id: "note-1",
      branchId: "branch-1",
      nestIds,
      feather: await sealText(feather, cipher),
      updatedAt,
      deletedAt: null,
      encryption: cipher.name,
      keyId: cipher.keyId,
    });

    const merged = await mergeStoredRows(
      "notes-directory",
      {
        base: await row("Notes", [], 1),
        local: await row("Entropy", [], 2),
        remote: await row("Notes", ["unit-1"], 3),
      },
      "remote",
    );

    expect(merged).toMatchObject({
      nestIds: ["unit-1"],
      keyId: cipher.keyId,
      encryption: "aes-gcm",
    });
    expect(merged).not.toHaveProperty("updatedAt");
    expect(
      await openText(String(merged?.feather), { encryption: "aes-gcm", keyId: cipher.keyId }),
    ).toBe("Entropy");
  });

  it("leaves a plaintext row plaintext and unmarked", async () => {
    const merged = await mergeStoredRows(
      "twigs",
      {
        base: { id: "t", title: "a", status: "incomplete", updatedAt: 1 },
        local: { id: "t", title: "a", status: "complete", updatedAt: 2 },
        remote: { id: "t", title: "b", status: "incomplete", updatedAt: 3 },
      },
      "local",
    );

    expect(merged).toEqual({
      id: "t",
      title: "b",
      status: "complete",
      encryption: undefined,
      keyId: undefined,
    });
  });

  it("carries a field that is not text through untouched", async () => {
    const merged = await mergeStoredRows(
      "share-paths",
      { base: null, local: { id: "p", path: 7 }, remote: { id: "p", path: 7 } },
      "local",
    );

    expect(merged?.path).toBe(7);
  });
});
