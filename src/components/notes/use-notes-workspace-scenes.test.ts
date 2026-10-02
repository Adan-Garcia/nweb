import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CanvasFile } from "@/lib/canvas/canvas-files";
import { createScene, type ImageElement, type Scene } from "@/lib/canvas/scene-model";

import type { SpatialSnapshot } from "./types";

// jsdom's Blob is cloned into a plain object by fake-indexeddb, so the real Blob -> data URL
// conversion (covered in blob-utils.test.ts) is replaced here.
vi.mock("@/lib/media/blob-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media/blob-utils")>()),
  blobToDataUrl: () => Promise.resolve("data:image/png;base64,restored"),
}));

async function loadWorkspace() {
  vi.resetModules();
  const { IDBFactory } = await import("fake-indexeddb");
  globalThis.indexedDB = new IDBFactory();

  const documents = await import("@/lib/notes/notes-document-storage");
  const { useNotesWorkspace } = await import("./use-notes-workspace");

  return {
    useNotesWorkspace,
    documents,
    saveSpatial: vi.spyOn(documents, "saveSpatialDocumentPayload"),
  };
}

function image(fileId: string, id = fileId): ImageElement {
  return { id, version: 1, index: "a0", type: "image", fileId, x: 0, y: 0, width: 10, height: 10 };
}

function file(id: string, withBlob: boolean): CanvasFile {
  return {
    id,
    mimeType: "image/png",
    created: 100,
    url: `data:image/png;base64,${id}`,
    ...(withBlob ? { blob: new Blob(["png"], { type: "image/png" }) } : {}),
  };
}

function snapshot(
  revision: number,
  elements: Scene["elements"],
  files: CanvasFile[],
): SpatialSnapshot {
  return {
    revision,
    scene: { ...createScene("infinite"), elements },
    files: new Map(files.map((entry) => [entry.id, entry])),
  };
}

// A second note in the branch the bootstrap creates, so switching away really reloads.
const otherNote = { branchId: null, nestIds: [], feather: "Lab 1" };

async function mountReady() {
  const env = await loadWorkspace();
  const hook = renderHook(() => env.useNotesWorkspace());
  await waitFor(() => expect(hook.result.current.isStorageReady).toBe(true));
  await waitFor(() => expect(hook.result.current.isHydratingDocument).toBe(false));
  return { ...env, ...hook };
}

describe("useNotesWorkspace: images on the canvas", () => {
  it("stores the new images a scene references, once, and keeps the rest referenced", async () => {
    const { result, saveSpatial } = await mountReady();

    act(() =>
      result.current.handleSpatialChange(
        snapshot(
          1,
          [image("new"), image("loaded")],
          [file("new", true), file("unused", true), file("loaded", false)],
        ),
      ),
    );
    await waitFor(() => expect(saveSpatial).toHaveBeenCalledOnce(), { timeout: 3000 });
    const saved = saveSpatial.mock.calls[0][0];
    expect(saved.files.map((entry) => entry.id)).toEqual(["new"]);
    expect(saved.files[0]).toMatchObject({ mimeType: "image/png", created: 100 });
    expect(saved.referencedFileIds).toEqual(["new", "loaded"]);

    // The next save of the same scene does not write the picture again.
    act(() => result.current.handleSpatialChange(snapshot(2, [image("new")], [file("new", true)])));
    await waitFor(() => expect(saveSpatial).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(saveSpatial.mock.calls[1][0].files).toEqual([]);
  });

  it("brings the images back when the note is opened again", async () => {
    const { result } = await mountReady();
    const firstId = result.current.activeDocumentId ?? "";

    act(() => result.current.handleSpatialChange(snapshot(1, [image("pic")], [file("pic", true)])));
    await act(async () => {
      await result.current.saveActiveDocumentNow();
    });
    await act(async () => {
      await result.current.createNoteAt(otherNote);
    });
    await act(async () => {
      await result.current.openDocumentById(firstId);
    });

    await waitFor(() => {
      const data = result.current.spatialInitialData;
      expect(data.status === "ready" && [...data.files.keys()]).toEqual(["pic"]);
    });
    const data = result.current.spatialInitialData;
    expect(data.status === "ready" && data.files.get("pic")).toMatchObject({
      mimeType: "image/png",
      url: "data:image/png;base64,restored",
    });
  });
});

describe("useNotesWorkspace: new drawing notes", () => {
  it("starts a paged note with its first page, without announcing a save", async () => {
    const { result, saveSpatial } = await mountReady();

    await act(async () => {
      await result.current.createNoteAt({ ...otherNote, feather: "Notebook" }, "spatial", "paged");
    });

    await waitFor(() => {
      const data = result.current.spatialInitialData;
      expect(data.status === "ready" && data.scene.layout).toBe("paged");
    });
    const data = result.current.spatialInitialData;
    expect(data.status === "ready" && data.scene.elements.map((element) => element.type)).toEqual([
      "page",
    ]);
    expect(saveSpatial).toHaveBeenCalledOnce();
    expect(result.current.lastSavedAt).toBeNull();
  });

  it("starts an infinite canvas when no kind is asked for", async () => {
    const { result } = await mountReady();

    await act(async () => {
      await result.current.createNoteAt({ ...otherNote, feather: "Sketch" }, "spatial");
    });

    const data = result.current.spatialInitialData;
    expect(data.status === "ready" && data.scene.layout).toBe("infinite");
  });
});

describe("useNotesWorkspace: drawings this build cannot read", () => {
  it.each([
    ["Excalidraw's old format", JSON.stringify({ type: "excalidraw", elements: [] }), "invalid"],
    ["a newer format", JSON.stringify({ format: 99, elements: [] }), "newer-format"],
  ])("opens %s as unreadable rather than as an empty canvas", async (_label, stored, reason) => {
    const { result, documents } = await mountReady();
    const firstId = result.current.activeDocumentId ?? "";
    await act(async () => {
      await result.current.createNoteAt(otherNote, "spatial");
    });
    await documents.saveSpatialDocumentPayload({
      documentId: firstId,
      compressionAlgorithm: "none",
      compressed: new TextEncoder().encode(stored),
      files: [],
    });

    await act(async () => {
      await result.current.openDocumentById(firstId);
    });

    expect(result.current.spatialInitialData).toEqual({ status: "unreadable", reason });
  });
});
