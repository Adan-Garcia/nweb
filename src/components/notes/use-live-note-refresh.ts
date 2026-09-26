import { useEffect } from "react";

import type { NotesDocumentMode } from "@/components/notes/types";
import type { NotesSessionRefs } from "@/components/notes/use-notes-session";
import { subscribeToSyncChanges } from "@/lib/sync/sync-service";

type UseLiveNoteRefreshOptions = {
  refs: Pick<
    NotesSessionRefs,
    "activeDocumentIdRef" | "pendingLinearEditAtRef" | "pendingSpatialSceneVersionRef"
  >;
  activeCreatedMode: NotesDocumentMode;
  hydrateDocument: (documentId: string, targetMode?: NotesDocumentMode) => Promise<void>;
  refreshDirectoryEntries: () => Promise<unknown>;
  refreshSnapshot: () => Promise<unknown>;
};

/**
 * Shows somebody else's edit in the note that is open, without it being reopened.
 *
 * A sync round says which rows it changed here. The list and the path bar are re-read for
 * any of them; the open note is reloaded only when its own content changed *and* nothing
 * typed here is still waiting to be saved. Reloading over unsaved typing would throw it
 * away — instead it is saved as usual, the next round merges it with theirs, and the merged
 * note arrives here as another change, with nothing pending, and is shown then.
 */
export function useLiveNoteRefresh({
  refs,
  activeCreatedMode,
  hydrateDocument,
  refreshDirectoryEntries,
  refreshSnapshot,
}: UseLiveNoteRefreshOptions) {
  const { activeDocumentIdRef, pendingLinearEditAtRef, pendingSpatialSceneVersionRef } = refs;

  useEffect(
    () =>
      subscribeToSyncChanges((changed) => {
        void refreshDirectoryEntries();
        void refreshSnapshot();

        const documentId = activeDocumentIdRef.current;
        const isOpenNote = changed.some(
          (row) => row.store === "notes-documents" && row.id === documentId,
        );
        const hasUnsavedEdits =
          pendingLinearEditAtRef.current !== null || pendingSpatialSceneVersionRef.current !== null;

        if (documentId && isOpenNote && !hasUnsavedEdits) {
          void hydrateDocument(documentId, activeCreatedMode);
        }
      }),
    [
      activeCreatedMode,
      activeDocumentIdRef,
      hydrateDocument,
      pendingLinearEditAtRef,
      pendingSpatialSceneVersionRef,
      refreshDirectoryEntries,
      refreshSnapshot,
    ],
  );
}
