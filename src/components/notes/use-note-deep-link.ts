import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

type NoteDeepLink = {
  isStorageReady: boolean;
  activeDocumentId: string | null;
  openDocumentById: (documentId: string) => Promise<void>;
};

/**
 * `?note=<id>` opens that note: how the command palette hands a note to this page. Cleared
 * once acted on, so the address bar does not keep reopening a note someone has moved on
 * from.
 */
export function useNoteDeepLink({
  isStorageReady,
  activeDocumentId,
  openDocumentById,
}: NoteDeepLink) {
  const [params, setParams] = useSearchParams();
  const noteId = params.get("note");

  useEffect(() => {
    if (!isStorageReady || !noteId) {
      return;
    }

    setParams({}, { replace: true });

    if (noteId !== activeDocumentId) {
      void openDocumentById(noteId);
    }
  }, [isStorageReady, noteId, activeDocumentId, openDocumentById, setParams]);
}
