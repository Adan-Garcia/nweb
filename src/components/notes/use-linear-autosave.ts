import { useCallback, useEffect } from "react";

import type { NotesDocumentMode } from "@/components/notes/types";
import type { NotesSessionRefs } from "@/components/notes/use-notes-session";
import type { MediaWorkerClient } from "@/lib/media-worker-client";
import { saveLinearDocumentPayload } from "@/lib/notes-document-storage";

type UseLinearAutosaveOptions = {
  refs: NotesSessionRefs;
  mediaWorker: MediaWorkerClient;
  isStorageReady: boolean;
  isHydratingDocument: boolean;
  activeDocumentId: string | null;
  activeCreatedMode: NotesDocumentMode;
  pendingLinearEditAt: number | null;
  clearPendingLinearEdit: () => void;
  markSaved: () => void;
};

/** Persists linear content, debouncing edits into a single save. */
export function useLinearAutosave({
  refs,
  mediaWorker,
  isStorageReady,
  isHydratingDocument,
  activeDocumentId,
  activeCreatedMode,
  pendingLinearEditAt,
  clearPendingLinearEdit,
  markSaved,
}: UseLinearAutosaveOptions) {
  const { latestLinearContentRef, linearSaveTimeoutRef, pendingLinearEditAtRef } = refs;
  const persistLinearContent = useCallback(
    async (content: string, documentId: string, createdMode?: NotesDocumentMode) => {
      const compressed = await mediaWorker.compressText(content);

      await saveLinearDocumentPayload({
        documentId,
        createdMode,
        compressionAlgorithm: compressed.algorithm,
        compressed: compressed.bytes,
      });

      markSaved();
    },
    [markSaved, mediaWorker],
  );

  useEffect(() => {
    if (
      !isStorageReady ||
      !activeDocumentId ||
      isHydratingDocument ||
      pendingLinearEditAt === null
    ) {
      return;
    }

    if (linearSaveTimeoutRef.current) {
      window.clearTimeout(linearSaveTimeoutRef.current);
    }

    const scheduledEditAt = pendingLinearEditAt;
    const contentForScheduledSave = latestLinearContentRef.current;

    linearSaveTimeoutRef.current = window.setTimeout(() => {
      if (pendingLinearEditAtRef.current !== scheduledEditAt) {
        return;
      }

      void persistLinearContent(contentForScheduledSave, activeDocumentId, activeCreatedMode).then(
        () => {
          if (pendingLinearEditAtRef.current === scheduledEditAt) {
            clearPendingLinearEdit();
          }
        },
      );
    }, 700);

    return () => {
      if (linearSaveTimeoutRef.current) {
        window.clearTimeout(linearSaveTimeoutRef.current);
      }
    };
  }, [
    activeDocumentId,
    activeCreatedMode,
    clearPendingLinearEdit,
    isHydratingDocument,
    isStorageReady,
    pendingLinearEditAt,
    persistLinearContent,
    latestLinearContentRef,
    linearSaveTimeoutRef,
    pendingLinearEditAtRef,
  ]);

  return { persistLinearContent };
}
