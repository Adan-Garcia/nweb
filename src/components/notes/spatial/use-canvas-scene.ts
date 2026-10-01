import { useCallback, useRef, useState } from "react";

import type { SpatialSnapshot } from "@/components/notes/types";
import type { CanvasFile, CanvasFiles } from "@/lib/canvas/canvas-files";
import {
  diffElements,
  EMPTY_HISTORY,
  type History,
  recordStep,
  redo,
  undo,
} from "@/lib/canvas/history";
import type { Scene, SceneElement } from "@/lib/canvas/scene-model";

/**
 * The open drawing: its scene, files, undo history and selection. Tools change it in
 * gestures (begin, update as the pointer moves, end), and a gesture is one undo step and
 * one save however many pointer events it took.
 *
 * `liveRef` mirrors the state for pointer handlers, which run between renders and must see
 * what the previous event did.
 */
export function useCanvasScene(
  initial: { scene: Scene; files: CanvasFiles },
  onChange: (snapshot: SpatialSnapshot) => void,
) {
  const [scene, setScene] = useState(initial.scene);
  const [files, setFiles] = useState(initial.files);
  const [history, setHistory] = useState<History>(EMPTY_HISTORY);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const liveRef = useRef({ scene, files, history, revision: 0 });
  const gestureStartRef = useRef<SceneElement[] | null>(null);

  const publish = useCallback(
    (next: { scene: Scene; files?: CanvasFiles; history?: History }, save: boolean) => {
      const live = liveRef.current;
      const updated = {
        scene: next.scene,
        files: next.files ?? live.files,
        history: next.history ?? live.history,
        revision: save ? live.revision + 1 : live.revision,
      };
      liveRef.current = updated;
      setScene(updated.scene);
      setFiles(updated.files);
      setHistory(updated.history);
      if (save) {
        onChange({ scene: updated.scene, files: updated.files, revision: updated.revision });
      }
    },
    [onChange],
  );

  /** One whole change: recorded for undo and saved. */
  const commit = useCallback(
    (elements: SceneElement[], added: readonly CanvasFile[] = []) => {
      const live = liveRef.current;
      const nextFiles = new Map(live.files);
      for (const file of added) {
        nextFiles.set(file.id, file);
      }
      publish(
        {
          scene: { ...live.scene, elements },
          files: nextFiles,
          history: recordStep(live.history, diffElements(live.scene.elements, elements)),
        },
        true,
      );
    },
    [publish],
  );

  const beginGesture = useCallback(() => {
    gestureStartRef.current = liveRef.current.scene.elements;
  }, []);

  /** Shows a gesture's progress without recording or saving it. */
  const updateGesture = useCallback(
    (elements: SceneElement[]) => {
      publish({ scene: { ...liveRef.current.scene, elements } }, false);
    },
    [publish],
  );

  /** Ends a gesture: whatever it changed since it began is one undo step and one save. */
  const endGesture = useCallback(
    (elements?: SceneElement[]) => {
      const start = gestureStartRef.current;
      gestureStartRef.current = null;
      const live = liveRef.current;
      const final = elements ?? live.scene.elements;
      const step = diffElements(start ?? live.scene.elements, final);
      if (!step.changes.length) {
        return;
      }
      publish(
        { scene: { ...live.scene, elements: final }, history: recordStep(live.history, step) },
        true,
      );
    },
    [publish],
  );

  /** Abandons a gesture: back to how things were before it, recorded nowhere. */
  const cancelGesture = useCallback(() => {
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (start) {
      publish({ scene: { ...liveRef.current.scene, elements: start } }, false);
    }
  }, [publish]);

  const move = useCallback(
    (direction: "undo" | "redo") => {
      const live = liveRef.current;
      const moved = (direction === "undo" ? undo : redo)(live.history, live.scene.elements);
      if (moved) {
        publish(
          { scene: { ...live.scene, elements: moved.elements }, history: moved.history },
          true,
        );
      }
    },
    [publish],
  );

  return {
    scene,
    files,
    selection,
    setSelection,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    liveRef,
    commit,
    beginGesture,
    updateGesture,
    endGesture,
    cancelGesture,
    undo: useCallback(() => move("undo"), [move]),
    redo: useCallback(() => move("redo"), [move]),
  };
}

export type CanvasSceneState = ReturnType<typeof useCanvasScene>;
