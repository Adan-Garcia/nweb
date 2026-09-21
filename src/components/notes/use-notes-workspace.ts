import { useCallback, useState } from "react";

import {
  EMPTY_SELECTION,
  selectionForEntry,
  type WorkspaceSelection,
} from "@/components/notes/location-hierarchy";
import type { NotesDirectoryEntry, NotesDocumentMode, NotesMode } from "@/components/notes/types";
import { useDocumentSwitchQueue } from "@/components/notes/use-document-switch-queue";
import { useLinearAutosave } from "@/components/notes/use-linear-autosave";
import { useLinearNoteState } from "@/components/notes/use-linear-note-state";
import { useNotesBootstrap } from "@/components/notes/use-notes-bootstrap";
import { useNotesDelete } from "@/components/notes/use-notes-delete";
import { useNotesFlush } from "@/components/notes/use-notes-flush";
import { useNotesHydration } from "@/components/notes/use-notes-hydration";
import { useNotesImageIngest } from "@/components/notes/use-notes-image-ingest";
import type { NoteDraftPlacement } from "@/components/notes/use-notes-location-picker";
import { useNotesSession } from "@/components/notes/use-notes-session";
import { useSpatialAutosave } from "@/components/notes/use-spatial-autosave";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import {
  createNotesDirectoryEntry,
  findNotesDirectoryEntry,
  listNotesDirectoryEntries,
} from "@/lib/notes-directory-storage";
import { ensureDefaultWorkspace } from "@/lib/workspace-storage";
import type { WorkspaceSnapshot } from "@/lib/workspace-tree";

export function useNotesWorkspace() {
  const { mediaWorker, refs } = useNotesSession();
  const { activeDocumentIdRef } = refs;

  const [mode, setMode] = useState<NotesMode>("linear");
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [directoryEntries, setDirectoryEntries] = useState<NotesDirectoryEntry[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [selectedCreatedMode, setSelectedCreatedMode] = useState<NotesDocumentMode>("linear");
  const [activeSelection, setActiveSelection] = useState<WorkspaceSelection>(EMPTY_SELECTION);
  const { snapshot, setSnapshot, refreshSnapshot } = useWorkspaceSnapshot();

  // Derived: once the note has a directory entry, the stored mode is the truth.
  const activeCreatedMode =
    directoryEntries.find((entry) => entry.id === activeDocumentId)?.createdMode ??
    selectedCreatedMode;

  const markSaved = useCallback(() => setLastSavedAt(Date.now()), []);
  const markStorageReady = useCallback(() => setIsStorageReady(true), []);

  /**
   * Sets the open note in both the state the UI renders and the ref queued work reads.
   * They are written together, synchronously, so an operation that starts after a switch
   * cannot still see the note that was open when it was queued.
   */
  const applyActiveDocumentId = useCallback(
    (documentId: string | null) => {
      activeDocumentIdRef.current = documentId;
      setActiveDocumentId(documentId);
    },
    [activeDocumentIdRef],
  );

  const runInDocumentSwitchQueue = useDocumentSwitchQueue();
  const { optimizedAssetCount, handleSpatialPaste } = useNotesImageIngest({
    mediaWorker,
    spatialHostRef: refs.spatialHostRef,
    mode,
  });

  const refreshDirectoryEntries = useCallback(async () => {
    const entries = await listNotesDirectoryEntries();
    setDirectoryEntries(entries);

    return entries;
  }, []);

  const {
    linearContent,
    pendingLinearEditAt,
    setLinearContent,
    resetLinearContent,
    clearPendingLinearEdit,
  } = useLinearNoteState(refs);

  const {
    hydrateDocument,
    isHydratingDocument,
    spatialInitialData,
    isSpatialEditorReloading,
    spatialEditorReloadKey,
  } = useNotesHydration({
    refs,
    mediaWorker,
    resetLinearContent,
    clearPendingLinearEdit,
  });

  const { persistLinearContent } = useLinearAutosave({
    refs,
    mediaWorker,
    isStorageReady,
    isHydratingDocument,
    activeDocumentId,
    activeCreatedMode,
    pendingLinearEditAt,
    clearPendingLinearEdit,
    markSaved,
  });

  const { persistSpatialSnapshot, handleSpatialChange } = useSpatialAutosave({
    refs,
    mediaWorker,
    isStorageReady,
    isHydratingDocument,
    activeDocumentId,
    activeCreatedMode,
    markSaved,
  });

  const { persistActiveDocumentBeforeSwitch, saveActiveDocumentNow } = useNotesFlush({
    refs,
    isStorageReady,
    activeDocumentId,
    activeCreatedMode,
    persistLinearContent,
    persistSpatialSnapshot,
    clearPendingLinearEdit,
    refreshDirectoryEntries,
  });

  /** Makes an existing entry the active note. Shared by opening one and by what follows a delete. */
  const openEntry = useCallback(
    async (entry: NotesDirectoryEntry) => {
      setActiveSelection(selectionForEntry(snapshot, entry));
      setSelectedCreatedMode(entry.createdMode);
      setMode(entry.createdMode);
      applyActiveDocumentId(entry.id);
      await hydrateDocument(entry.id, entry.createdMode);
    },
    [applyActiveDocumentId, hydrateDocument, snapshot],
  );

  const openDocumentById = useCallback(
    async (documentId: string) => {
      if (!documentId) {
        return;
      }

      await runInDocumentSwitchQueue("openDocumentById", async () => {
        await persistActiveDocumentBeforeSwitch("openDocumentById", documentId);

        const entry = directoryEntries.find((candidate) => candidate.id === documentId);

        if (entry) {
          await openEntry(entry);
          return;
        }

        applyActiveDocumentId(documentId);
        await hydrateDocument(documentId);
      });
    },
    [
      applyActiveDocumentId,
      directoryEntries,
      hydrateDocument,
      openEntry,
      persistActiveDocumentBeforeSwitch,
      runInDocumentSwitchQueue,
    ],
  );

  /**
   * Opens the note with this title in this branch, or creates it. A placement with no
   * branch means nothing has been chosen yet, so the default workspace supplies one.
   */
  const createNoteAt = useCallback(
    async (placement: NoteDraftPlacement, preferredMode?: NotesDocumentMode) => {
      const targetMode = preferredMode ?? mode;
      const branchId = placement.branchId ?? (await ensureDefaultWorkspace()).path.branch.id;
      const existing = await findNotesDirectoryEntry({ branchId, feather: placement.feather });

      await runInDocumentSwitchQueue("createNoteAt", async () => {
        await persistActiveDocumentBeforeSwitch("createNoteAt", existing?.id ?? "");

        const entry =
          existing ??
          (await createNotesDirectoryEntry({
            branchId,
            feather: placement.feather,
            nestIds: placement.nestIds,
            createdMode: targetMode,
          }));

        const [nextEntries, nextSnapshot] = await Promise.all([
          refreshDirectoryEntries(),
          refreshSnapshot(),
        ]);
        const createdEntry = nextEntries.find((candidate) => candidate.id === entry.id) ?? entry;

        applyActiveDocumentId(entry.id);
        setActiveSelection(selectionForEntry(nextSnapshot, createdEntry));
        setSelectedCreatedMode(createdEntry.createdMode);
        setMode(createdEntry.createdMode);
        await hydrateDocument(entry.id, createdEntry.createdMode);
      });
    },
    [
      applyActiveDocumentId,
      hydrateDocument,
      mode,
      persistActiveDocumentBeforeSwitch,
      refreshDirectoryEntries,
      refreshSnapshot,
      runInDocumentSwitchQueue,
    ],
  );

  const applyInitialEntries = useCallback(
    (
      nextSnapshot: WorkspaceSnapshot,
      entries: NotesDirectoryEntry[],
      initialEntry: NotesDirectoryEntry,
    ) => {
      setSnapshot(nextSnapshot);
      setDirectoryEntries(entries);
      applyActiveDocumentId(initialEntry.id);
      setSelectedCreatedMode(initialEntry.createdMode);
      setActiveSelection(selectionForEntry(nextSnapshot, initialEntry));
      setMode(initialEntry.createdMode);
    },
    [applyActiveDocumentId, setSnapshot],
  );

  const { deleteDocument } = useNotesDelete({
    refs,
    clearPendingLinearEdit,
    refreshDirectoryEntries,
    openEntry,
    runInDocumentSwitchQueue,
  });

  useNotesBootstrap({ hydrateDocument, applyInitialEntries, markStorageReady });

  return {
    mode,
    setMode,
    directoryEntries,
    activeDocumentId,
    activeCreatedMode,
    activeSelection,
    snapshot,
    refreshSnapshot,
    isHydratingDocument,
    linearContent,
    setLinearContent,
    isStorageReady,
    lastSavedAt,
    optimizedAssetCount,
    spatialInitialData,
    isSpatialEditorReloading,
    spatialEditorReloadKey,
    spatialHostRef: refs.spatialHostRef,
    createNoteAt,
    openDocumentById,
    deleteDocument,
    refreshDirectoryEntries,
    saveActiveDocumentNow,
    handleSpatialChange,
    handleSpatialPaste,
  };
}
