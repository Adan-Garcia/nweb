import { useCallback } from "react";

import type { NotesDirectoryEntry } from "@/components/notes/types";
import type { useDocumentSwitchQueue } from "@/components/notes/use-document-switch-queue";
import type { NotesSessionRefs } from "@/components/notes/use-notes-session";
import { ensureDefaultWorkspace } from "@/lib/hierarchy/workspace-storage";
import { softDeleteNote } from "@/lib/notes/notes-delete";
import { createNotesDirectoryEntry } from "@/lib/notes/notes-directory-storage";

type UseNotesDeleteOptions = {
  refs: NotesSessionRefs;
  clearPendingLinearEdit: () => void;
  refreshDirectoryEntries: () => Promise<NotesDirectoryEntry[]>;
  openEntry: (entry: NotesDirectoryEntry) => Promise<void>;
  runInDocumentSwitchQueue: ReturnType<typeof useDocumentSwitchQueue>;
};

/** Deletes a note and decides what the editor shows afterwards. */
export function useNotesDelete({
  refs,
  clearPendingLinearEdit,
  refreshDirectoryEntries,
  openEntry,
  runInDocumentSwitchQueue,
}: UseNotesDeleteOptions) {
  const {
    activeDocumentIdRef,
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

      await runInDocumentSwitchQueue("deleteDocument", async () => {
        // Read here, not when the delete was asked for: a switch queued ahead of this one
        // may have opened or left this very note in the meantime, and getting it wrong
        // either leaves the editor pointing at a note that no longer exists or lets the
        // open note's autosave write a deleted row back.
        const wasActive = documentId === activeDocumentIdRef.current;

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
          const { path } = await ensureDefaultWorkspace();

          await createNotesDirectoryEntry({
            branchId: path.branch.id,
            feather: "Untitled note",
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
      activeDocumentIdRef,
      cancelPendingWrites,
      openEntry,
      refreshDirectoryEntries,
      runInDocumentSwitchQueue,
    ],
  );

  return { deleteDocument };
}
