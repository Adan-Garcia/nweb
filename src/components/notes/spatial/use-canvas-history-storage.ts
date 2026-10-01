import { useEffect, useRef } from "react";

import type { CanvasSceneState } from "@/components/notes/spatial/use-canvas-scene";
import type { History } from "@/lib/canvas/history";
import { readCanvasHistory, saveCanvasHistory } from "@/lib/canvas/history-storage";

/** How long the history waits after a change before it is written. */
const SAVE_DELAY_MS = 1000;

function save(documentId: string, history: History) {
  // A history that cannot be written (the workspace locked under it) costs undo steps
  // after a reload, never the note, so it is not worth an error on screen.
  saveCanvasHistory(documentId, history).catch(() => undefined);
}

/**
 * Keeps the open note's undo history on this device: read when the note opens, written a
 * moment after each change and when the note closes. Nothing is written until the saved
 * history has been read, so a stroke made while it loads cannot replace it.
 */
export function useCanvasHistoryStorage(
  documentId: string | null,
  sceneState: Pick<CanvasSceneState, "history" | "adoptHistory">,
  isReadOnly: boolean,
) {
  const { history, adoptHistory } = sceneState;
  const loadedRef = useRef(false);
  const pendingRef = useRef<History | null>(null);

  useEffect(() => {
    if (!documentId || isReadOnly) {
      return;
    }

    let current = true;
    void readCanvasHistory(documentId).then((saved) => {
      if (current) {
        loadedRef.current = true;
        adoptHistory(saved);
      }
    });

    return () => {
      current = false;
      loadedRef.current = false;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) {
        save(documentId, pending);
      }
    };
  }, [adoptHistory, documentId, isReadOnly]);

  useEffect(() => {
    if (!documentId || !loadedRef.current) {
      return;
    }

    pendingRef.current = history;
    const timer = window.setTimeout(() => {
      pendingRef.current = null;
      save(documentId, history);
    }, SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [documentId, history]);
}
