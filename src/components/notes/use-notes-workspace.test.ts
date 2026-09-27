import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Excalidraw is a heavy browser-only bundle; the hook only needs these two helpers.
let sceneVersion = 0;
vi.mock("@excalidraw/excalidraw", () => ({
  getSceneVersion: () => sceneVersion,
  serializeAsJSON: (elements: readonly unknown[], appState: unknown) =>
    JSON.stringify({ elements, appState }),
}));

// Each test gets a fresh IndexedDB and fresh lib modules (the DB connection is cached per module).
async function loadWorkspace() {
  vi.resetModules();
  const { IDBFactory } = await import("fake-indexeddb");
  globalThis.indexedDB = new IDBFactory();

  const documents = await import("@/lib/notes/notes-document-storage");
  const directory = await import("@/lib/notes/notes-directory-storage");
  const model = await import("@/lib/notes/notes-model");
  const { useNotesWorkspace } = await import("./use-notes-workspace");

  return {
    useNotesWorkspace,
    documents,
    directory,
    model,
    spies: {
      loadDocument: vi.spyOn(documents, "loadNotesDocument"),
      saveLinear: vi.spyOn(documents, "saveLinearDocumentPayload"),
      saveSpatial: vi.spyOn(documents, "saveSpatialDocumentPayload"),
      listEntries: vi.spyOn(directory, "listNotesDirectoryEntries"),
    },
  };
}

type Workspace = ReturnType<Awaited<ReturnType<typeof loadWorkspace>>["useNotesWorkspace"]>;

// A minimal stand-in for Excalidraw's large AppState; the mocked serializer only echoes it.
const appState = {} as Parameters<Workspace["handleSpatialChange"]>[1];

/** The open note's title, read through the selection the path bar renders from. */
function activeFeather(workspace: Workspace) {
  return (
    workspace.directoryEntries.find((entry) => entry.id === workspace.activeSelection.featherId)
      ?.feather ?? null
  );
}

// A second note. `branchId: null` means "wherever the default workspace put the first one",
// which is what the picker passes before any branch has been chosen.
const otherNote = { branchId: null, nestIds: [], feather: "Lab 1" };

async function mountReady() {
  const env = await loadWorkspace();
  const hook = renderHook(() => env.useNotesWorkspace());
  await waitFor(() => expect(hook.result.current.isStorageReady).toBe(true));
  await waitFor(() => expect(hook.result.current.isHydratingDocument).toBe(false));
  return { ...env, ...hook };
}

async function savedLinearText(
  documents: Awaited<ReturnType<typeof loadWorkspace>>["documents"],
  documentId: string,
) {
  const loaded = await documents.loadNotesDocument(documentId);
  const bytes = loaded?.document.linearCompressed;
  return bytes ? new TextDecoder().decode(bytes) : null;
}

beforeEach(() => {
  sceneVersion = 0;
});

describe("useNotesWorkspace: bootstrap", () => {
  it("creates a default note, opens it, and settles after hydrating exactly once", async () => {
    const { result, spies } = await mountReady();

    expect(result.current.directoryEntries).toHaveLength(1);
    expect(result.current.activeDocumentId).toBe(result.current.directoryEntries[0].id);
    expect(result.current.mode).toBe("linear");
    expect(result.current.linearContent).toContain("<p>");

    // Guards against a hydration loop: counts must not keep growing once settled.
    const settled = {
      list: spies.listEntries.mock.calls.length,
      load: spies.loadDocument.mock.calls.length,
    };
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(spies.listEntries.mock.calls.length).toBe(settled.list);
    expect(spies.loadDocument.mock.calls.length).toBe(settled.load);
    // Legacy-document probe + one hydration of the new default note.
    expect(settled.load).toBe(2);
  });

  it("adopts a legacy single-document note as the first directory entry", async () => {
    const env = await loadWorkspace();
    await env.documents.saveLinearDocumentPayload({
      documentId: env.model.DEFAULT_NOTES_DOCUMENT_ID,
      compressionAlgorithm: "none",
      compressed: new TextEncoder().encode("<p>legacy</p>"),
    });

    const { result } = renderHook(() => env.useNotesWorkspace());
    await waitFor(() => expect(result.current.isStorageReady).toBe(true));
    await waitFor(() => expect(result.current.linearContent).toBe("<p>legacy</p>"));

    expect(result.current.activeDocumentId).toBe(env.model.DEFAULT_NOTES_DOCUMENT_ID);
    expect(result.current.directoryEntries[0].feather).toBe("Legacy note");
  });
});

describe("useNotesWorkspace: linear autosave", () => {
  it("saves an edit only after the debounce, and batches rapid edits into one save", async () => {
    const { result, documents, spies } = await mountReady();
    const documentId = result.current.activeDocumentId ?? "";

    // Back-to-back edits, possibly inside the same millisecond, must still batch
    // into one save of the latest content.
    act(() => result.current.setLinearContent("<p>a</p>"));
    act(() => result.current.setLinearContent("<p>ab</p>"));
    expect(spies.saveLinear).not.toHaveBeenCalled();

    await waitFor(() => expect(result.current.lastSavedAt).not.toBeNull(), { timeout: 3000 });

    expect(spies.saveLinear).toHaveBeenCalledTimes(1);
    expect(await savedLinearText(documents, documentId)).toBe("<p>ab</p>");
  });

  it("ignores a set to identical content", async () => {
    const { result, spies } = await mountReady();

    act(() => result.current.setLinearContent(result.current.linearContent));
    await new Promise((resolve) => setTimeout(resolve, 900));

    expect(spies.saveLinear).not.toHaveBeenCalled();
  });

  it("saveActiveDocumentNow persists immediately and refreshes the directory", async () => {
    const { result, documents } = await mountReady();
    const documentId = result.current.activeDocumentId ?? "";

    act(() => result.current.setLinearContent("<p>now</p>"));
    await act(async () => {
      await result.current.saveActiveDocumentNow();
    });

    expect(result.current.lastSavedAt).not.toBeNull();
    expect(await savedLinearText(documents, documentId)).toBe("<p>now</p>");
  });
});

describe("useNotesWorkspace: switching documents", () => {
  it("flushes unsaved edits on the outgoing note before opening another", async () => {
    const { result, documents } = await mountReady();
    const firstId = result.current.activeDocumentId ?? "";

    act(() => result.current.setLinearContent("<p>unsaved</p>"));
    await act(async () => {
      await result.current.createNoteAt(otherNote);
    });

    expect(result.current.activeDocumentId).not.toBe(firstId);
    expect(activeFeather(result.current)).toBe("Lab 1");
    expect(result.current.directoryEntries).toHaveLength(2);
    expect(result.current.linearContent).not.toBe("<p>unsaved</p>");
    expect(await savedLinearText(documents, firstId)).toBe("<p>unsaved</p>");

    await act(async () => {
      await result.current.openDocumentById(firstId);
    });
    expect(result.current.activeDocumentId).toBe(firstId);
    expect(result.current.linearContent).toBe("<p>unsaved</p>");
  });

  it("flushes unsaved edits when switching with openDocumentById", async () => {
    const { result, documents } = await mountReady();
    const firstId = result.current.activeDocumentId ?? "";
    await act(async () => {
      await result.current.createNoteAt(otherNote);
    });
    const secondId = result.current.activeDocumentId ?? "";

    act(() => result.current.setLinearContent("<p>second draft</p>"));
    await act(async () => {
      await result.current.openDocumentById(firstId);
    });

    expect(await savedLinearText(documents, secondId)).toBe("<p>second draft</p>");
  });

  it("ignores an empty document id", async () => {
    const { result } = await mountReady();
    const before = result.current.activeDocumentId;

    await act(async () => {
      await result.current.openDocumentById("");
    });

    expect(result.current.activeDocumentId).toBe(before);
  });

  it("runs overlapping switches one after another", async () => {
    const { result } = await mountReady();

    await act(async () => {
      await Promise.all([
        result.current.createNoteAt(otherNote),
        result.current.createNoteAt({ ...otherNote, feather: "Lab 2" }),
      ]);
    });

    expect(result.current.directoryEntries).toHaveLength(3);
    expect(activeFeather(result.current)).toBe("Lab 2");
  });
});

describe("useNotesWorkspace: spatial persistence", () => {
  it("debounces scene changes into a single spatial save", async () => {
    const { result, spies } = await mountReady();

    sceneVersion = 1;
    act(() => result.current.handleSpatialChange([], appState, {}));
    sceneVersion = 2;
    act(() => result.current.handleSpatialChange([], appState, {}));
    expect(spies.saveSpatial).not.toHaveBeenCalled();

    await waitFor(() => expect(spies.saveSpatial).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(spies.saveSpatial.mock.calls[0][0]).toMatchObject({
      documentId: result.current.activeDocumentId,
      files: [],
    });
    await waitFor(() => expect(result.current.lastSavedAt).not.toBeNull());
  });

  it("does not schedule a save when the scene version is unchanged", async () => {
    const { result, spies } = await mountReady();

    sceneVersion = 0;
    act(() => result.current.handleSpatialChange([], appState, {}));
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(spies.saveSpatial).not.toHaveBeenCalled();
  });

  it("restores a saved scene when the spatial note is opened again", async () => {
    const { result, documents } = await mountReady();
    const firstId = result.current.activeDocumentId ?? "";

    sceneVersion = 5;
    act(() => result.current.handleSpatialChange([], appState, {}));
    await act(async () => {
      await result.current.saveActiveDocumentNow();
    });
    await act(async () => {
      await result.current.createNoteAt(otherNote);
    });
    await act(async () => {
      await result.current.openDocumentById(firstId);
    });

    const stored = await documents.loadNotesDocument(firstId);
    expect(stored?.document.sceneCompressed).not.toBeNull();
    await waitFor(() => expect(result.current.spatialInitialData).not.toBeNull());
    expect(result.current.spatialInitialData?.elements).toEqual([]);
  });
});

describe("useNotesWorkspace: spatial notes", () => {
  it("recycles the canvas when a spatial note is opened, then settles", async () => {
    const { result } = await mountReady();
    expect(result.current.spatialEditorReloadKey).toBe(0);

    await act(async () => {
      await result.current.createNoteAt(otherNote, "spatial");
    });

    expect(result.current.mode).toBe("spatial");
    expect(result.current.activeCreatedMode).toBe("spatial");
    expect(result.current.spatialEditorReloadKey).toBe(1);
    expect(result.current.isSpatialEditorReloading).toBe(false);
    expect(result.current.isHydratingDocument).toBe(false);
  });

  it("still recycles the canvas where requestAnimationFrame does not exist", async () => {
    const { result } = await mountReady();
    vi.stubGlobal("requestAnimationFrame", undefined);

    await act(async () => {
      await result.current.createNoteAt(otherNote, "spatial");
    });
    vi.unstubAllGlobals();

    expect(result.current.spatialEditorReloadKey).toBe(1);
    expect(result.current.isSpatialEditorReloading).toBe(false);
  });

  it("opens a note whose scene was never saved with an empty canvas", async () => {
    const { result } = await mountReady();

    await act(async () => {
      await result.current.createNoteAt(otherNote, "spatial");
    });

    expect(result.current.spatialInitialData).toBeNull();
  });
});

describe("useNotesWorkspace: failures", () => {
  it("falls back to the default content when a note cannot be loaded", async () => {
    const { result, spies } = await mountReady();
    const firstId = result.current.activeDocumentId ?? "";
    act(() => result.current.setLinearContent("<p>custom</p>"));
    await act(async () => {
      await result.current.createNoteAt(otherNote);
    });

    spies.loadDocument.mockRejectedValueOnce(new Error("disk unavailable"));
    await act(async () => {
      await result.current.openDocumentById(firstId);
    });

    expect(result.current.activeDocumentId).toBe(firstId);
    expect(result.current.linearContent).toContain("Lecture Notes");
    expect(result.current.isHydratingDocument).toBe(false);
    expect(result.current.spatialInitialData).toBeNull();
  });

  it("still switches notes when saving the outgoing linear edits fails", async () => {
    const { result, spies } = await mountReady();
    const firstId = result.current.activeDocumentId ?? "";
    spies.saveLinear.mockRejectedValueOnce(new Error("quota exceeded"));

    act(() => result.current.setLinearContent("<p>unsaved</p>"));
    await act(async () => {
      await result.current.createNoteAt(otherNote);
    });

    expect(result.current.activeDocumentId).not.toBe(firstId);
    expect(spies.saveLinear).toHaveBeenCalled();
  });

  it("still switches notes when saving the outgoing canvas fails", async () => {
    const { result, spies } = await mountReady();
    spies.saveSpatial.mockRejectedValueOnce(new Error("quota exceeded"));

    sceneVersion = 3;
    act(() => result.current.handleSpatialChange([], appState, {}));
    await act(async () => {
      await result.current.createNoteAt(otherNote);
    });

    expect(activeFeather(result.current)).toBe("Lab 1");
    expect(spies.saveSpatial).toHaveBeenCalledOnce();
  });

  it("becomes ready, with no note open, when storage cannot be read at startup", async () => {
    const env = await loadWorkspace();
    env.spies.listEntries.mockRejectedValue(new Error("idb blocked"));

    const { result } = renderHook(() => env.useNotesWorkspace());
    await waitFor(() => expect(result.current.isStorageReady).toBe(true));

    expect(result.current.activeDocumentId).toBeNull();
    expect(result.current.directoryEntries).toEqual([]);
  });

  it("does not open a note if it is unmounted before storage answers", async () => {
    const env = await loadWorkspace();
    const hook = renderHook(() => env.useNotesWorkspace());
    hook.unmount();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(hook.result.current.activeDocumentId).toBeNull();
    expect(hook.result.current.isStorageReady).toBe(false);
  });
});

describe("useNotesWorkspace: guards and races", () => {
  it("does not save a stale debounced edit after a manual save already wrote it", async () => {
    const { result, spies } = await mountReady();

    act(() => result.current.setLinearContent("<p>saved by hand</p>"));
    await act(async () => {
      await result.current.saveActiveDocumentNow();
    });
    const callsAfterManualSave = spies.saveLinear.mock.calls.length;

    await new Promise((resolve) => setTimeout(resolve, 900));

    expect(spies.saveLinear.mock.calls.length).toBe(callsAfterManualSave);
  });

  it("does not flush anything when 'switching' to the note that is already open", async () => {
    const { result, spies } = await mountReady();
    const currentId = result.current.activeDocumentId ?? "";

    act(() => result.current.setLinearContent("<p>pending</p>"));
    await act(async () => {
      await result.current.openDocumentById(currentId);
    });

    expect(spies.saveLinear).not.toHaveBeenCalled();
  });

  it("ignores a manual save requested before storage is ready", async () => {
    const env = await loadWorkspace();
    const { result } = renderHook(() => env.useNotesWorkspace());

    await act(async () => {
      await result.current.saveActiveDocumentNow();
    });

    expect(env.spies.saveLinear).not.toHaveBeenCalled();
    expect(result.current.lastSavedAt).toBeNull();
  });

  it("abandons a note that finished loading after the workspace was closed", async () => {
    const env = await loadWorkspace();
    const hook = renderHook(() => env.useNotesWorkspace());
    await waitFor(() => expect(hook.result.current.isStorageReady).toBe(true));
    const firstId = hook.result.current.activeDocumentId ?? "";
    await act(async () => {
      await hook.result.current.createNoteAt(otherNote);
    });

    env.spies.loadDocument.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(null), 30)),
    );
    const opening = hook.result.current.openDocumentById(firstId);
    hook.unmount();

    await expect(opening).resolves.toBeUndefined();
  });

  it("abandons a note whose load failed after the workspace was closed", async () => {
    const env = await loadWorkspace();
    const hook = renderHook(() => env.useNotesWorkspace());
    await waitFor(() => expect(hook.result.current.isStorageReady).toBe(true));
    const firstId = hook.result.current.activeDocumentId ?? "";
    await act(async () => {
      await hook.result.current.createNoteAt(otherNote);
    });

    env.spies.loadDocument.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error("late failure")), 30)),
    );
    const opening = hook.result.current.openDocumentById(firstId);
    hook.unmount();

    await expect(opening).resolves.toBeUndefined();
  });
});

describe("useNotesWorkspace: deleting a note", () => {
  it("opens the most recent surviving note when the open one is deleted", async () => {
    const { result } = await mountReady();
    const firstId = result.current.activeDocumentId ?? "";
    await act(async () => {
      await result.current.createNoteAt(otherNote);
    });
    const secondId = result.current.activeDocumentId ?? "";

    await act(async () => {
      await result.current.deleteDocument(secondId);
    });

    expect(result.current.directoryEntries.map((entry) => entry.id)).toEqual([firstId]);
    expect(result.current.activeDocumentId).toBe(firstId);
  });

  it("leaves the open note where it is when a different note is deleted", async () => {
    const { result } = await mountReady();
    const firstId = result.current.activeDocumentId ?? "";
    await act(async () => {
      await result.current.createNoteAt(otherNote);
    });
    const secondId = result.current.activeDocumentId ?? "";

    await act(async () => {
      await result.current.deleteDocument(firstId);
    });

    expect(result.current.activeDocumentId).toBe(secondId);
    expect(activeFeather(result.current)).toBe("Lab 1");
  });

  it("hands back an empty note when the last one is deleted", async () => {
    const { result } = await mountReady();
    const onlyId = result.current.activeDocumentId ?? "";

    await act(async () => {
      await result.current.deleteDocument(onlyId);
    });

    // A workspace with nothing in it is the state a fresh install is in, so it gets the
    // same starting note rather than an editor with no note open.
    expect(result.current.directoryEntries).toHaveLength(1);
    expect(result.current.activeDocumentId).not.toBe(onlyId);
    expect(result.current.activeDocumentId).not.toBeNull();
    expect(result.current.linearContent).toContain("Lecture Notes");
  });

  it("ignores an empty document id and a note that is already gone", async () => {
    const { result } = await mountReady();
    const onlyId = result.current.activeDocumentId ?? "";

    await act(async () => {
      await result.current.deleteDocument("");
    });
    expect(result.current.activeDocumentId).toBe(onlyId);

    await act(async () => {
      await result.current.deleteDocument(onlyId);
    });
    const replacementId = result.current.activeDocumentId;

    await act(async () => {
      await result.current.deleteDocument(onlyId);
    });
    expect(result.current.activeDocumentId).toBe(replacementId);
    expect(result.current.directoryEntries).toHaveLength(1);
  });

  it("does not let a debounced text edit write the deleted note back", async () => {
    const { result, documents, spies } = await mountReady();
    const doomedId = result.current.activeDocumentId ?? "";

    act(() => result.current.setLinearContent("<p>typed a moment before deleting</p>"));

    // Storage slower than the 700ms autosave debounce, which is the window where a timer
    // armed before the delete fires after the row is already gone and writes it back. The
    // empty result is the true one: this is the only note, so the refresh after the delete
    // really does find nothing. Copying this into a test with a second note would lie.
    spies.listEntries.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      return [];
    });

    await act(async () => {
      await result.current.deleteDocument(doomedId);
    });

    expect(spies.saveLinear).not.toHaveBeenCalled();
    expect(await documents.loadNotesDocument(doomedId)).toBeNull();
  });

  it("does not let a debounced canvas edit write the deleted note back", async () => {
    const { result, documents, spies } = await mountReady();
    const doomedId = result.current.activeDocumentId ?? "";

    sceneVersion = 7;
    act(() => result.current.handleSpatialChange([], appState, {}));

    // Same window and the same truthful empty result, against the 500ms canvas debounce.
    // That timer persists a snapshot it captured up front and re-checks nothing, so only
    // cancelling it stops the write.
    spies.listEntries.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      return [];
    });

    await act(async () => {
      await result.current.deleteDocument(doomedId);
    });

    expect(spies.saveSpatial).not.toHaveBeenCalled();
    expect(await documents.loadNotesDocument(doomedId)).toBeNull();
  });
});

describe("useNotesWorkspace: deleting while a switch is queued", () => {
  it("still leaves a live note open when the deleted one was opened by a queued switch", async () => {
    const { result } = await mountReady();
    const firstId = result.current.activeDocumentId ?? "";
    await act(async () => {
      await result.current.createNoteAt(otherNote);
    });
    const secondId = result.current.activeDocumentId ?? "";
    await act(async () => {
      await result.current.openDocumentById(firstId);
    });

    // Both calls are made from the same render, so both see the first note as the open
    // one. The switch runs first and makes the second note active; the delete then runs
    // against a note that has become the open one since it was asked for.
    await act(async () => {
      await Promise.all([
        result.current.openDocumentById(secondId),
        result.current.deleteDocument(secondId),
      ]);
    });

    expect(result.current.directoryEntries.map((entry) => entry.id)).toEqual([firstId]);
    expect(result.current.activeDocumentId).toBe(firstId);
  });
});
