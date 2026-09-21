import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NotesHierarchyLocation } from "@/lib/notes-model";

import { createPngSceneFile, newSceneFileId } from "./excalidraw-adapter";

// Excalidraw is a heavy browser-only bundle; the hook only needs these two helpers.
let sceneVersion = 0;
vi.mock("@excalidraw/excalidraw", () => ({
  getSceneVersion: () => sceneVersion,
  serializeAsJSON: (elements: readonly unknown[], appState: unknown) =>
    JSON.stringify({ elements, appState }),
}));

// jsdom's Blob is cloned into a plain object by fake-indexeddb, so the real Blob -> data URL
// conversion (covered in blob-utils.test.ts) is replaced here.
vi.mock("@/lib/blob-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/blob-utils")>()),
  blobToDataUrl: () => Promise.resolve("data:image/png;base64,restored"),
}));

async function loadWorkspace() {
  vi.resetModules();
  const { IDBFactory } = await import("fake-indexeddb");
  globalThis.indexedDB = new IDBFactory();

  const documents = await import("@/lib/notes-document-storage");
  const { useNotesWorkspace } = await import("./use-notes-workspace");

  return { useNotesWorkspace, saveSpatial: vi.spyOn(documents, "saveSpatialDocumentPayload") };
}

type Workspace = ReturnType<Awaited<ReturnType<typeof loadWorkspace>>["useNotesWorkspace"]>;
type SpatialElements = Parameters<Workspace["handleSpatialChange"]>[0];
type SpatialAppState = Parameters<Workspace["handleSpatialChange"]>[1];

// Minimal stand-ins for Excalidraw's large element and app-state types; only `fileId` is read.
const appState = {} as SpatialAppState;
const imageElement = (fileId: string) => ({ type: "image", fileId }) as SpatialElements[number];

const otherLocation: NotesHierarchyLocation = {
  wing: "School",
  flight: "Spring 2027",
  branch: "Physics",
  nest: "Labs",
  feather: "Lab 1",
};

async function mountReady() {
  const env = await loadWorkspace();
  const hook = renderHook(() => env.useNotesWorkspace());
  await waitFor(() => expect(hook.result.current.isStorageReady).toBe(true));
  await waitFor(() => expect(hook.result.current.isHydratingDocument).toBe(false));
  return { ...env, ...hook };
}

beforeEach(() => {
  sceneVersion = 0;
});

describe("useNotesWorkspace: images on the canvas", () => {
  it("stores the images a scene references, optimized, and skips the rest", async () => {
    const { result, saveSpatial } = await mountReady();
    const used = newSceneFileId();
    const unused = newSceneFileId();

    sceneVersion = 1;
    act(() =>
      result.current.handleSpatialChange([imageElement(used)], appState, {
        [used]: createPngSceneFile(used, "data:image/png;base64,AAAA", 100),
        [unused]: createPngSceneFile(unused, "data:image/png;base64,BBBB", 200),
      }),
    );

    await waitFor(() => expect(saveSpatial).toHaveBeenCalledOnce(), { timeout: 3000 });
    const saved = saveSpatial.mock.calls[0][0];
    expect(saved.files.map((file) => file.id)).toEqual([used]);
    expect(saved.files[0]).toMatchObject({ mimeType: "image/png", created: 100 });
    expect(saved.referencedFileIds).toEqual([used]);
  });

  it("brings the images back when the note is opened again", async () => {
    const { result } = await mountReady();
    const firstId = result.current.activeDocumentId ?? "";
    const id = newSceneFileId();

    sceneVersion = 2;
    act(() =>
      result.current.handleSpatialChange([imageElement(id)], appState, {
        [id]: createPngSceneFile(id, "data:image/png;base64,AAAA", 100),
      }),
    );
    await act(async () => {
      await result.current.saveActiveDocumentNow();
    });
    await act(async () => {
      await result.current.createOrOpenDocumentAtLocation(otherLocation);
    });
    await act(async () => {
      await result.current.openDocumentById(firstId);
    });

    await waitFor(() => expect(result.current.spatialInitialData).not.toBeNull());
    expect(Object.keys(result.current.spatialInitialData?.files ?? {})).toEqual([id]);
    expect(result.current.spatialInitialData?.files?.[id]).toMatchObject({
      id,
      mimeType: "image/png",
      dataURL: "data:image/png;base64,restored",
    });
  });
});
