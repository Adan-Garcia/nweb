import { useCallback, useState } from "react";

import { defaultLinearContent } from "@/components/notes/constants";
import type { NotesSessionRefs } from "@/components/notes/use-notes-session";

/** The linear (rich text) editor's content and its pending-edit marker. */
export function useLinearNoteState(refs: NotesSessionRefs) {
  const { latestLinearContentRef, pendingLinearEditAtRef } = refs;
  const [linearContent, setLinearContentState] = useState(defaultLinearContent);
  const [pendingLinearEditAt, setPendingLinearEditAt] = useState<number | null>(
    null,
  );

  const setLinearContent = useCallback(
    (nextContent: string) => {
      if (nextContent === latestLinearContentRef.current) {
        return;
      }

      latestLinearContentRef.current = nextContent;
      setLinearContentState(nextContent);

      const editAt = Date.now();
      pendingLinearEditAtRef.current = editAt;
      setPendingLinearEditAt(editAt);
    },
    [latestLinearContentRef, pendingLinearEditAtRef],
  );

  /** Replaces the content without marking it as an unsaved edit. */
  const resetLinearContent = useCallback(
    (content: string) => {
      latestLinearContentRef.current = content;
      setLinearContentState(content);
    },
    [latestLinearContentRef],
  );

  const clearPendingLinearEdit = useCallback(() => {
    pendingLinearEditAtRef.current = null;
    setPendingLinearEditAt(null);
  }, [pendingLinearEditAtRef]);

  return {
    linearContent,
    pendingLinearEditAt,
    setLinearContent,
    resetLinearContent,
    clearPendingLinearEdit,
  };
}
