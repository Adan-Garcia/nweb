import { useCallback, useMemo } from "react";

import type { CanvasCamera } from "@/components/notes/spatial/use-canvas-camera";
import type { CanvasSceneState } from "@/components/notes/spatial/use-canvas-scene";
import { fitRect, toScene } from "@/lib/canvas/camera";
import {
  insertPage,
  layoutPages,
  movePage,
  orderedPages,
  pageAt,
  type PlacedPage,
} from "@/lib/canvas/pages";
import { removePage } from "@/lib/canvas/scene-edits";
import type { SceneElement } from "@/lib/canvas/scene-model";

/**
 * The pages of a paged note, for the thumbnail strip: which one is in view, and going to,
 * adding, moving and deleting them. Each change is one undo step, like any other.
 */
export function useCanvasPages(
  sceneState: Pick<CanvasSceneState, "scene" | "liveRef" | "commit">,
  camera: Pick<CanvasCamera, "camera" | "viewport" | "setCamera">,
) {
  const { scene, liveRef, commit } = sceneState;
  const { camera: view, viewport, setCamera } = camera;
  const pages = useMemo(() => layoutPages(orderedPages(scene)), [scene]);
  const center = toScene(view, { x: viewport.width / 2, y: viewport.height / 2 });
  const current = pageAt(pages, center) ?? pages[0] ?? null;
  const currentId = current?.page.id ?? null;

  const goTo = useCallback(
    (placed: PlacedPage) => setCamera(fitRect(placed.rect, viewport)),
    [setCamera, viewport],
  );

  /** Commits a change to the stack and follows page `id` to where it now is. */
  const commitShowing = useCallback(
    (elements: SceneElement[], id: string) => {
      commit(elements);
      const placed = layoutPages(orderedPages({ elements })).find(({ page }) => page.id === id);
      if (placed) {
        goTo(placed);
      }
    },
    [commit, goTo],
  );

  /** A new page after the one in view (or at the end), shown once it is there. */
  const add = useCallback(() => {
    const elements = liveRef.current.scene.elements;
    const page = insertPage(orderedPages({ elements }), currentId);
    commitShowing([...elements, page], page.id);
  }, [commitShowing, currentId, liveRef]);

  const move = useCallback(
    (id: string, to: number) => {
      const moved = movePage(liveRef.current.scene.elements, id, to);
      if (moved) {
        commitShowing(moved, id);
      }
    },
    [commitShowing, liveRef],
  );

  /** Deletes a page and what is written on it; the last page stays, or there is no note. */
  const remove = useCallback(
    (id: string) => {
      const elements = liveRef.current.scene.elements;
      if (orderedPages({ elements }).length > 1) {
        commit(removePage(elements, id));
      }
    },
    [commit, liveRef],
  );

  return { pages, currentId, goTo, add, move, remove };
}

export type CanvasPages = ReturnType<typeof useCanvasPages>;
