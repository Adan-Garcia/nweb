import { beforeEach, describe, expect, it } from "vitest";

import { BRANCH_ID } from "@/test/workspace-fixtures";

import { getNotesDb } from "./notes-db";
import { buildPebbleName, formatPebbleSize } from "./pebble-model";
import {
  createPebble,
  findPebbleByMediaId,
  listPebbles,
  loadPebbleBlob,
  softDeletePebble,
  updatePebble,
} from "./pebble-storage";

const imageBlob = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });

// jsdom's Blob is cloned into a plain object by fake-indexeddb's structuredClone, so these
// assertions stop at "a row is there under this id"; the bytes themselves are covered by
// blob-utils.test.ts and by the E2E suite.

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("pebbles"),
    database.clear("notes-media"),
    database.clear("notes-documents"),
  ]);
});

describe("pebble model", () => {
  it("formats a size in the largest unit that fits", () => {
    expect(formatPebbleSize(0)).toBe("0 B");
    expect(formatPebbleSize(512)).toBe("512 B");
    expect(formatPebbleSize(2048)).toBe("2 KB");
    expect(formatPebbleSize(1024 * 1024 * 3.5)).toBe("3.5 MB");
  });

  it("names a dropped file, which arrives with a content-hash id and no name", () => {
    expect(buildPebbleName("image/webp", Date.UTC(2026, 3, 16))).toBe("WEBP 2026-04-16");
    expect(buildPebbleName("nonsense", 0)).toMatch(/^FILE /);
  });
});

describe("pebble storage", () => {
  it("records a file and stores its bytes under the media id", async () => {
    const pebble = await createPebble({
      branchId: BRANCH_ID,
      name: "Diagram",
      blob: imageBlob(),
    });

    expect(pebble).toMatchObject({
      branchId: BRANCH_ID,
      name: "Diagram",
      mimeType: "image/webp",
      size: 3,
      deletedAt: null,
    });
    expect(await loadPebbleBlob(pebble)).not.toBeNull();
  });

  it("reuses the blob a canvas image already stored rather than copying it", async () => {
    const database = await getNotesDb();
    await database.put("notes-media", {
      id: "scene-file-1",
      blob: imageBlob(),
      mimeType: "image/webp",
      created: 1,
      updatedAt: 1,
    });

    const pebble = await createPebble({
      branchId: BRANCH_ID,
      name: "Same picture",
      blob: imageBlob(),
      mediaId: "scene-file-1",
    });

    expect(pebble.mediaId).toBe("scene-file-1");
    expect(await database.count("notes-media")).toBe(1);
  });

  it("finds the file a branch already lists, so a re-drop is not a second row", async () => {
    const pebble = await createPebble({
      branchId: BRANCH_ID,
      name: "Diagram",
      blob: imageBlob(),
      mediaId: "media-1",
    });

    expect(await findPebbleByMediaId(BRANCH_ID, "media-1")).toMatchObject({ id: pebble.id });
    expect(await findPebbleByMediaId("other-branch", "media-1")).toBeNull();
  });

  it("renames and re-tags a file", async () => {
    const pebble = await createPebble({ branchId: BRANCH_ID, name: "Old", blob: imageBlob() });

    expect(await updatePebble(pebble.id, { name: "New", nestIds: ["nest-1"] })).toMatchObject({
      name: "New",
      nestIds: ["nest-1"],
    });
    expect(await updatePebble("missing", { name: "X" })).toBeNull();
  });

  it("drops the bytes with the last pebble that pointed at them", async () => {
    const pebble = await createPebble({
      branchId: BRANCH_ID,
      name: "Diagram",
      blob: imageBlob(),
      mediaId: "media-1",
    });

    expect(await softDeletePebble(pebble.id)).toBe(true);

    const database = await getNotesDb();
    expect(await database.get("notes-media", "media-1")).toBeUndefined();
    expect(await listPebbles()).toEqual([]);
  });

  it("keeps the bytes while another branch still lists the same file", async () => {
    const here = await createPebble({
      branchId: BRANCH_ID,
      name: "Diagram",
      blob: imageBlob(),
      mediaId: "media-1",
    });
    await createPebble({
      branchId: "other-branch",
      name: "Diagram",
      blob: imageBlob(),
      mediaId: "media-1",
    });

    await softDeletePebble(here.id);

    const database = await getNotesDb();
    expect(await database.get("notes-media", "media-1")).toBeDefined();
  });

  it("keeps the bytes while a note's scene still draws them", async () => {
    const database = await getNotesDb();
    const pebble = await createPebble({
      branchId: BRANCH_ID,
      name: "Diagram",
      blob: imageBlob(),
      mediaId: "media-1",
    });
    await database.put("notes-documents", {
      id: "note-1",
      linearCompressed: null,
      linearCompressionAlgorithm: null,
      sceneCompressed: null,
      sceneCompressionAlgorithm: null,
      sceneFiles: [{ id: "media-1", mimeType: "image/webp", created: 1 }],
      updatedAt: 1,
    });

    await softDeletePebble(pebble.id);

    expect(await database.get("notes-media", "media-1")).toBeDefined();
  });

  it("reports nothing to do for an unknown id or a file already deleted", async () => {
    const pebble = await createPebble({ branchId: BRANCH_ID, name: "D", blob: imageBlob() });

    expect(await softDeletePebble("missing")).toBe(false);
    expect(await softDeletePebble(pebble.id)).toBe(true);
    expect(await softDeletePebble(pebble.id)).toBe(false);
    expect(await loadPebbleBlob(pebble)).toBeNull();
  });
});
