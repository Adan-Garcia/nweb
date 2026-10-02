import { type RefObject, useCallback, useEffect } from "react";

import type { CanvasCamera } from "@/components/notes/spatial/use-canvas-camera";
import type { CanvasClipboard } from "@/components/notes/spatial/use-canvas-clipboard";
import type { CanvasSceneState } from "@/components/notes/spatial/use-canvas-scene";
import { fitRect, toScene } from "@/lib/canvas/camera";
import { contentBounds } from "@/lib/canvas/element-bounds";
import { layoutById, layoutPages, orderedPages, pageAt } from "@/lib/canvas/pages";
import { isPlaced } from "@/lib/canvas/scene-edits";
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
  clipboard,
  tool,
  setTool,
  fitView,
  isReadOnly,
}: {
  hostRef: RefObject<HTMLElement | null>;
  sceneState: CanvasSceneState;
  clipboard: Pick<CanvasClipboard, "copy" | "remove">;
  tool: CanvasTool;
  setTool: (tool: CanvasTool) => void;
  fitView: () => void;
  isReadOnly: boolean;
}) {
  const { undo, redo } = sceneState;
  const { copy, remove } = clipboard;

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
      // A paste is left to the browser, whose paste event carries what is on the clipboard.
      if (!command || command.type === "paste" || (isReadOnly && command.type !== "fit")) {
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
      } else if (command.type === "copy") {
        void copy();
      } else if (command.type === "delete") {
        remove();
      }
    };
    host.addEventListener("keydown", onKeyDown);

    return () => host.removeEventListener("keydown", onKeyDown);
  }, [copy, fitView, hostRef, isReadOnly, redo, remove, setTool, tool, undo]);
}
