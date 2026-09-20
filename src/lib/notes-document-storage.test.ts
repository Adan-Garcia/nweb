import { describe, expect, it, vi } from "vitest";

import { listNotesDirectoryEntries, upsertNotesDirectoryEntry } from "./notes-directory-storage";
import {
  loadNotesDocument,
  saveLinearDocumentPayload,
  saveSpatialDocumentPayload,
} from "./notes-document-storage";
import type { PersistedSceneFile } from "./notes-model";

// jsdom's Blob is cloned into a plain object by fake-indexeddb's structuredClone,
// so the real Blob -> data URL conversion is covered in blob-utils.test.ts instead.
vi.mock("./blob-utils", () => ({
  blobToDataUrl: vi.fn(() => Promise.resolve("data:mock")),
}));

function sceneFile(id: string, text: string): PersistedSceneFile {
  return {
    id,
    blob: new Blob([text], { type: "text/plain" }),
    mimeType: "text/plain",
    created: 42,
  };
}

describe("notes document storage", () => {
  it("returns null for a document that was never saved", async () => {
    expect(await loadNotesDocument("doc-missing")).toBeNull();
  });

  it("round-trips a linear payload", async () => {
    const compressed = new Uint8Array([1, 2, 3]);
    await saveLinearDocumentPayload({
      documentId: "doc-linear",
      compressionAlgorithm: "gzip",
      compressed,
    });

    const loaded = await loadNotesDocument("doc-linear");

    expect(Array.from(loaded?.document.linearCompressed ?? [])).toEqual([1, 2, 3]);
    expect(loaded?.document.linearCompressionAlgorithm).toBe("gzip");
    expect(loaded?.document.sceneCompressed).toBeNull();
  });

  it("touches the directory entry when a document is saved", async () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    await upsertNotesDirectoryEntry({
      id: "doc-touched",
      location: { wing: "W", flight: "F", branch: "B", nest: "N", feather: "T" },
    });

    vi.spyOn(Date, "now").mockReturnValue(999);
    await saveLinearDocumentPayload({
      documentId: "doc-touched",
      compressionAlgorithm: "gzip",
      compressed: new Uint8Array([9]),
    });

    const entry = (await listNotesDirectoryEntries()).find((item) => item.id === "doc-touched");
    expect(entry?.updatedAt).toBe(999);
  });

  it("saves spatial payloads with their media and loads them back as data URLs", async () => {
    await saveSpatialDocumentPayload({
      documentId: "doc-spatial",
      compressionAlgorithm: "gzip",
      compressed: new Uint8Array([7]),
      files: [sceneFile("f1", "one")],
    });

    const loaded = await loadNotesDocument("doc-spatial");

    expect(Array.from(loaded?.document.sceneCompressed ?? [])).toEqual([7]);
    expect(loaded?.sceneFiles.f1).toEqual({
      id: "f1",
      mimeType: "text/plain",
      created: 42,
      dataUrl: "data:mock",
    });
  });

  it("drops media that is no longer in the payload", async () => {
    const base = {
      documentId: "doc-prune",
      compressionAlgorithm: "gzip",
      compressed: new Uint8Array([1]),
    };
    await saveSpatialDocumentPayload({
      ...base,
      files: [sceneFile("a", "a"), sceneFile("b", "b")],
    });
    await saveSpatialDocumentPayload({ ...base, files: [sceneFile("b", "b")] });

    const loaded = await loadNotesDocument("doc-prune");

    expect(Object.keys(loaded?.sceneFiles ?? {})).toEqual(["b"]);
  });

  it("retains previously stored media that the scene still references", async () => {
    const base = {
      documentId: "doc-retain",
      compressionAlgorithm: "gzip",
      compressed: new Uint8Array([1]),
    };
    await saveSpatialDocumentPayload({
      ...base,
      files: [sceneFile("keep", "k"), sceneFile("drop", "d")],
    });
    await saveSpatialDocumentPayload({ ...base, files: [], referencedFileIds: ["keep"] });

    const loaded = await loadNotesDocument("doc-retain");

    expect(Object.keys(loaded?.sceneFiles ?? {})).toEqual(["keep"]);
  });

  it("drops referenced media once it is neither in the payload nor stored before", async () => {
    await saveSpatialDocumentPayload({
      documentId: "doc-unknown-ref",
      compressionAlgorithm: "gzip",
      compressed: new Uint8Array([1]),
      files: [],
      referencedFileIds: ["never-saved"],
    });

    expect((await loadNotesDocument("doc-unknown-ref"))?.sceneFiles).toEqual({});
  });
});
