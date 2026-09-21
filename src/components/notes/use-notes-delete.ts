import { useCallback } from "react";

import { FALLBACK_LOCATION } from "@/components/notes/location-hierarchy";
import type { NotesDirectoryEntry } from "@/components/notes/types";
import type { useDocumentSwitchQueue } from "@/components/notes/use-document-switch-queue";
import type { NotesSessionRefs } from "@/components/notes/use-notes-session";
import { softDeleteNote } from "@/lib/notes-delete";
import { createNotesDirectoryEntry } from "@/lib/notes-directory-storage";

type UseNotesDeleteOptions = {
  refs: NotesSessionRefs;
  activeDocumentId: string | null;
  clearPendingLinearEdit: () => void;
  refreshDirectoryEntries: () => Promise<NotesDirectoryEntry[]>;
  openEntry: (entry: NotesDirectoryEntry) => Promise<void>;
  runInDocumentSwitchQueue: ReturnType<typeof useDocumentSwitchQueue>;
};

/** Deletes a note and decides what the editor shows afterwards. */
export function useNotesDelete({
  refs,
  activeDocumentId,
  clearPendingLinearEdit,
  refreshDirectoryEntries,
  openEntry,
  runInDocumentSwitchQueue,
}: UseNotesDeleteOptions) {
  const {
    latestSpatialSnapshotRef,
    linearSaveTimeoutRef,
    pendingSpatialSceneVersionRef,
    spatialSaveTimeoutRef,
  } = refs;

  /**
   * Unlike a switch, a delete must not flush first: the note is about to go, so writing it
   * back would resurrect the document row. Clearing the linear marker is enough to disarm
   * that timer, which re-checks it, but the spatial timer persists a snapshot it already
   * captured and checks nothing, so it has to be cancelled outright. The stale snapshot is
   * dropped too, or the next switch would carry the deleted note's scene into whichever
   * note opens after it.
   */
  const cancelPendingWrites = useCallback(() => {
    if (linearSaveTimeoutRef.current) {
      window.clearTimeout(linearSaveTimeoutRef.current);
      linearSaveTimeoutRef.current = null;
    }

    if (spatialSaveTimeoutRef.current) {
      window.clearTimeout(spatialSaveTimeoutRef.current);
      spatialSaveTimeoutRef.current = null;
    }

    latestSpatialSnapshotRef.current = null;
    pendingSpatialSceneVersionRef.current = null;
    clearPendingLinearEdit();
  }, [
    clearPendingLinearEdit,
    latestSpatialSnapshotRef,
    linearSaveTimeoutRef,
    pendingSpatialSceneVersionRef,
    spatialSaveTimeoutRef,
  ]);

  const deleteDocument = useCallback(
    async (documentId: string) => {
      if (!documentId) {
        return;
      }

      const wasActive = documentId === activeDocumentId;

      await runInDocumentSwitchQueue("deleteDocument", async () => {
        if (wasActive) {
          cancelPendingWrites();
        }

        const wasDeleted = await softDeleteNote(documentId);

        if (!wasDeleted) {
          return;
        }

        let entries = await refreshDirectoryEntries();

        // Deleting the last note leaves the workspace in the state a fresh install is in,
        // so it gets the same empty note back rather than an editor with nothing open.
        if (!entries.length) {
          await createNotesDirectoryEntry({
            location: FALLBACK_LOCATION,
            createdMode: "linear",
          });
          entries = await refreshDirectoryEntries();
        }

        const nextEntry = entries[0];

        if (wasActive && nextEntry) {
          await openEntry(nextEntry);
        }
      });
    },
    [
      activeDocumentId,
      cancelPendingWrites,
      openEntry,
      refreshDirectoryEntries,
      runInDocumentSwitchQueue,
    ],
  );

  return { deleteDocument };
}
