import { useCallback, useState } from "react";

import {
  FALLBACK_LOCATION,
  normalizeLocation,
  toLocation,
} from "@/components/notes/location-hierarchy";
import type {
  NotesDirectoryEntry,
  NotesDocumentMode,
  NotesHierarchyLocation,
  NotesMode,
} from "@/components/notes/types";
import { useDocumentSwitchQueue } from "@/components/notes/use-document-switch-queue";
import { useLinearAutosave } from "@/components/notes/use-linear-autosave";
import { useLinearNoteState } from "@/components/notes/use-linear-note-state";
import { useNotesBootstrap } from "@/components/notes/use-notes-bootstrap";
import { useNotesDelete } from "@/components/notes/use-notes-delete";
import { useNotesFlush } from "@/components/notes/use-notes-flush";
import { useNotesHydration } from "@/components/notes/use-notes-hydration";
import { useNotesImageIngest } from "@/components/notes/use-notes-image-ingest";
import { useNotesSession } from "@/components/notes/use-notes-session";
import { useSpatialAutosave } from "@/components/notes/use-spatial-autosave";
import {
  createNotesDirectoryEntry,
  findNotesDirectoryEntryByLocation,
  listNotesDirectoryEntries,
} from "@/lib/notes-directory-storage";

export function useNotesWorkspace() {
  const { mediaWorker, refs } = useNotesSession();
  const { activeDocumentIdRef } = refs;

  const [mode, setMode] = useState<NotesMode>("linear");
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [directoryEntries, setDirectoryEntries] = useState<NotesDirectoryEntry[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [selectedCreatedMode, setSelectedCreatedMode] = useState<NotesDocumentMode>("linear");
  const [activeLocation, setActiveLocation] = useState<NotesHierarchyLocation>(FALLBACK_LOCATION);

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
      setActiveLocation(toLocation(entry));
      setSelectedCreatedMode(entry.createdMode);
      setMode(entry.createdMode);
      applyActiveDocumentId(entry.id);
      await hydrateDocument(entry.id, entry.createdMode);
    },
    [applyActiveDocumentId, hydrateDocument],
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

  const createOrOpenDocumentAtLocation = useCallback(
    async (location: NotesHierarchyLocation, preferredMode?: NotesDocumentMode) => {
      const normalizedLocation = normalizeLocation(location);
      const targetMode = preferredMode ?? mode;
      const existing = await findNotesDirectoryEntryByLocation(normalizedLocation);
      const documentId = existing?.id ?? null;

      await runInDocumentSwitchQueue("createOrOpenDocumentAtLocation", async () => {
        await persistActiveDocumentBeforeSwitch("createOrOpenDocumentAtLocation", documentId ?? "");

        const entry =
          existing ??
          (await createNotesDirectoryEntry({
            location: normalizedLocation,
            createdMode: targetMode,
          }));

        const nextEntries = await refreshDirectoryEntries();
        const createdEntry = nextEntries.find((candidate) => candidate.id === entry.id);

        applyActiveDocumentId(entry.id);
        setActiveLocation(createdEntry ? toLocation(createdEntry) : normalizedLocation);
        setSelectedCreatedMode(createdEntry?.createdMode ?? targetMode);
        setMode(createdEntry?.createdMode ?? targetMode);
        await hydrateDocument(entry.id, createdEntry?.createdMode ?? targetMode);
      });
    },
    [
      applyActiveDocumentId,
      hydrateDocument,
      mode,
      persistActiveDocumentBeforeSwitch,
      refreshDirectoryEntries,
      runInDocumentSwitchQueue,
    ],
  );

  const applyInitialEntries = useCallback(
    (entries: NotesDirectoryEntry[], initialEntry: NotesDirectoryEntry) => {
      setDirectoryEntries(entries);
      applyActiveDocumentId(initialEntry.id);
      setSelectedCreatedMode(initialEntry.createdMode);
      setActiveLocation(toLocation(initialEntry));
      setMode(initialEntry.createdMode);
    },
    [applyActiveDocumentId],
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
    activeLocation,
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
    createOrOpenDocumentAtLocation,
    openDocumentById,
    deleteDocument,
    refreshDirectoryEntries,
    saveActiveDocumentNow,
    handleSpatialChange,
    handleSpatialPaste,
  };
}
