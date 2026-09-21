import { useCallback } from "react";

import type { NotesDocumentMode, SpatialSnapshot } from "@/components/notes/types";
import type { NotesSessionRefs } from "@/components/notes/use-notes-session";
import { touchNotesDirectoryEntry } from "@/lib/notes-directory-storage";
import { notesTraceError } from "@/lib/notes-trace";

type SwitchContext = "openDocumentById" | "createNoteAt";

type PersistLinearContent = (
  content: string,
  documentId: string,
  createdMode?: NotesDocumentMode,
) => Promise<void>;

type PersistSpatialSnapshot = (
  documentId: string,
  createdMode?: NotesDocumentMode,
  snapshotOverride?: SpatialSnapshot | null,
  snapshotVersionOverride?: number | null,
) => Promise<void>;

type UseNotesFlushOptions = {
  refs: NotesSessionRefs;
  isStorageReady: boolean;
  activeDocumentId: string | null;
  activeCreatedMode: NotesDocumentMode;
  persistLinearContent: PersistLinearContent;
  persistSpatialSnapshot: PersistSpatialSnapshot;
  clearPendingLinearEdit: () => void;
  refreshDirectoryEntries: () => Promise<unknown>;
};

/** Writes the active document's unsaved changes: before a switch, or on demand. */
export function useNotesFlush({
  refs,
  isStorageReady,
  activeDocumentId,
  activeCreatedMode,
  persistLinearContent,
  persistSpatialSnapshot,
  clearPendingLinearEdit,
  refreshDirectoryEntries,
}: UseNotesFlushOptions) {
  const {
    latestLinearContentRef,
    latestSpatialSnapshotRef,
    pendingLinearEditAtRef,
    pendingSpatialSceneVersionRef,
  } = refs;
  const persistActiveDocumentBeforeSwitch = useCallback(
    async (context: SwitchContext, toDocumentId: string) => {
      if (!isStorageReady || !activeDocumentId || activeDocumentId === toDocumentId) {
        return;
      }

      const snapshotForSwitch = latestSpatialSnapshotRef.current;
      const snapshotVersionForSwitch = pendingSpatialSceneVersionRef.current;

      if (pendingLinearEditAtRef.current !== null) {
        try {
          await persistLinearContent(
            latestLinearContentRef.current,
            activeDocumentId,
            activeCreatedMode,
          );
        } catch (error) {
          notesTraceError("notes-workspace", `${context}:preswitch-linear-save-failed`, error, {
            fromDocumentId: activeDocumentId,
            toDocumentId,
          });
        }

        clearPendingLinearEdit();
      }

      if (snapshotForSwitch && snapshotVersionForSwitch !== null) {
        try {
          await persistSpatialSnapshot(
            activeDocumentId,
            activeCreatedMode,
            snapshotForSwitch,
            snapshotVersionForSwitch,
          );
        } catch (error) {
          notesTraceError("notes-workspace", `${context}:preswitch-spatial-save-failed`, error, {
            fromDocumentId: activeDocumentId,
            toDocumentId,
          });
        }
      }
    },
    [
      activeCreatedMode,
      activeDocumentId,
      clearPendingLinearEdit,
      isStorageReady,
      persistLinearContent,
      persistSpatialSnapshot,
      latestLinearContentRef,
      latestSpatialSnapshotRef,
      pendingLinearEditAtRef,
      pendingSpatialSceneVersionRef,
    ],
  );

  const saveActiveDocumentNow = useCallback(async () => {
    if (!isStorageReady || !activeDocumentId) {
      return;
    }

    const snapshotForManualSave = latestSpatialSnapshotRef.current;
    const snapshotVersionForManualSave = pendingSpatialSceneVersionRef.current;

    await persistLinearContent(latestLinearContentRef.current, activeDocumentId, activeCreatedMode);
    if (snapshotForManualSave && snapshotVersionForManualSave !== null) {
      await persistSpatialSnapshot(
        activeDocumentId,
        activeCreatedMode,
        snapshotForManualSave,
        snapshotVersionForManualSave,
      );
    }
    clearPendingLinearEdit();
    pendingSpatialSceneVersionRef.current = null;
    await touchNotesDirectoryEntry(activeDocumentId, activeCreatedMode);
    await refreshDirectoryEntries();
  }, [
    activeDocumentId,
    activeCreatedMode,
    clearPendingLinearEdit,
    isStorageReady,
    persistLinearContent,
    persistSpatialSnapshot,
    refreshDirectoryEntries,
    latestLinearContentRef,
    latestSpatialSnapshotRef,
    pendingSpatialSceneVersionRef,
  ]);

  return { persistActiveDocumentBeforeSwitch, saveActiveDocumentNow };
}
