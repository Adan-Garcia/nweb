import { useCallback, useRef } from "react";

import { notesTrace } from "@/lib/notes/notes-trace";

type SwitchContext = "openDocumentById" | "createNoteAt" | "deleteDocument";

/**
 * Serializes document switches: each operation starts only after the previous
 * one has finished, so overlapping open/create calls cannot interleave.
 */
export function useDocumentSwitchQueue() {
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  return useCallback(async (context: SwitchContext, operation: () => Promise<void>) => {
    const previousOperation = queueRef.current;
    let releaseCurrentOperation: () => void = () => {};

    const currentOperation = new Promise<void>((resolve) => {
      releaseCurrentOperation = resolve;
    });

    queueRef.current = previousOperation.then(() => currentOperation);

    notesTrace("notes-workspace", "document-switch:queued", {
      context,
    });

    await previousOperation;

    notesTrace("notes-workspace", "document-switch:running", {
      context,
    });

    try {
      await operation();
    } finally {
      releaseCurrentOperation();

      notesTrace("notes-workspace", "document-switch:complete", {
        context,
      });
    }
  }, []);
}
