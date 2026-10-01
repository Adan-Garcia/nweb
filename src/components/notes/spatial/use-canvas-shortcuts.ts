import { type RefObject, useCallback, useEffect } from "react";

import type { CanvasCamera } from "@/components/notes/spatial/use-canvas-camera";
import type { CanvasSceneState } from "@/components/notes/spatial/use-canvas-scene";
import { fitRect, toScene } from "@/lib/canvas/camera";
import { contentBounds } from "@/lib/canvas/element-bounds";
import { layoutById, layoutPages, orderedPages, pageAt } from "@/lib/canvas/pages";
import { isPlaced, removeElements } from "@/lib/canvas/scene-edits";
import { commandForKey } from "@/lib/canvas/shortcuts";
import type { CanvasTool } from "@/lib/canvas/tools";
import { isTypingTarget } from "@/lib/utils";

/**
 * The view that frames what matters: all the ink on an infinite note, the page in the
 * middle of the view on a paged one.
 */
export function useFitView(sceneState: CanvasSceneState, camera: CanvasCamera) {
  const { liveRef } = sceneState;
  const { cameraRef, viewport, setCamera } = camera;

  return useCallback(() => {
    const scene = liveRef.current.scene;
    const pages = layoutPages(orderedPages(scene));
    const center = toScene(cameraRef.current, { x: viewport.width / 2, y: viewport.height / 2 });
    const target =
      scene.layout === "paged"
        ? (pageAt(pages, center) ?? pages[0])?.rect
        : contentBounds(scene.elements.filter(isPlaced), layoutById(pages));
    if (target) {
      setCamera(fitRect(target, viewport));
    }
  }, [cameraRef, liveRef, setCamera, viewport]);
}

/** Single-key tools and the usual chords, while focus is in the canvas and not in a field. */
export function useCanvasShortcuts({
  hostRef,
  sceneState,
  tool,
  setTool,
  fitView,
  isReadOnly,
}: {
  hostRef: RefObject<HTMLElement | null>;
  sceneState: CanvasSceneState;
  tool: CanvasTool;
  setTool: (tool: CanvasTool) => void;
  fitView: () => void;
  isReadOnly: boolean;
}) {
  const { liveRef, selection, setSelection, commit, undo, redo } = sceneState;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      const command = commandForKey(event, tool);
      if (!command || (isReadOnly && command.type !== "fit")) {
        return;
      }

      event.preventDefault();
      if (command.type === "tool") {
        setTool(command.tool);
      } else if (command.type === "undo") {
        undo();
      } else if (command.type === "redo") {
        redo();
      } else if (command.type === "fit") {
        fitView();
      } else if (command.type === "delete" && selection.size) {
        commit(removeElements(liveRef.current.scene.elements, selection));
        setSelection(new Set());
      }
    };
    host.addEventListener("keydown", onKeyDown);

    return () => host.removeEventListener("keydown", onKeyDown);
  }, [
    commit,
    fitView,
    hostRef,
    isReadOnly,
    liveRef,
    redo,
    selection,
    setSelection,
    setTool,
    tool,
    undo,
  ]);
}
