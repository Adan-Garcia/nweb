import { useEffect, useState } from "react";

import { canWriteNote } from "@/lib/keys/access";

/**
 * Whether the open note may be edited here, or was shared to be read.
 *
 * The answer is kept with the id it was asked for and only believed for that id, so moving
 * to another note never shows the last one's answer while the new one is being looked up.
 * Until it arrives the note is treated as editable: storage refuses a reader's save either
 * way, and flashing every note read-only on open would be worse than that brief window.
 */
export function useNoteAccess(noteId: string | null) {
  const [answer, setAnswer] = useState<{ noteId: string | null; canWrite: boolean } | null>(null);

  useEffect(() => {
    let isCurrent = true;

    void canWriteNote(noteId).then((canWrite) => {
      if (isCurrent) {
        setAnswer({ noteId, canWrite });
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [noteId]);

  return { isReadOnly: answer?.noteId === noteId && !answer.canWrite };
}
