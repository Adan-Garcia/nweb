import { type RefObject, useCallback, useEffect, useSyncExternalStore } from "react";

import { canvasBlob, rasterize } from "@/components/notes/spatial/canvas-raster";
import type { CanvasCamera } from "@/components/notes/spatial/use-canvas-camera";
import type { CanvasSceneState } from "@/components/notes/spatial/use-canvas-scene";
import { toScene } from "@/lib/canvas/camera";
import {
  type ClipboardEntry,
  copyElements,
  getClipboard,
  pasteBounds,
  pasteElements,
  pastePlace,
  setClipboard,
  subscribeClipboard,
} from "@/lib/canvas/canvas-clipboard";
import { portableFile } from "@/lib/canvas/canvas-files";
import { layoutById, layoutPages, orderedPages } from "@/lib/canvas/pages";
import { isPlaced, removeElements, sortByIndex } from "@/lib/canvas/scene-edits";
import { createScene } from "@/lib/canvas/scene-model";

/** Written beside the PNG, so a paste can tell its own copy from another app's picture. */
const MARKER_PREFIX = "cuervo-canvas:";

/** Pixels per scene unit in the PNG a copy puts on the system clipboard. */
const COPY_SCALE = 2;

type ClipboardOptions = {
  hostRef: RefObject<HTMLElement | null>;
  sceneState: CanvasSceneState;
  camera: CanvasCamera;
  images: ReadonlyMap<string, CanvasImageSource>;
  isReadOnly: boolean;
  /** After a paste, with what it added selected: the lasso, to move it into place. */
  onPasted: () => void;
};

/** A PNG of a copied selection, for pasting into other apps. */
async function selectionPng(
  entry: ClipboardEntry,
  images: ReadonlyMap<string, CanvasImageSource>,
): Promise<Blob> {
  const scene = { ...createScene("infinite"), background: "blank" as const };
  const region = pasteBounds(entry.content, { x: 0, y: 0 });
  const canvas = rasterize({ ...scene, elements: entry.content.elements }, [], region, COPY_SCALE, {
    images,
    opaque: false,
  });
  const blob = await canvasBlob(canvas, "image/png");
  if (!blob) {
    throw new Error("The selection could not be drawn.");
  }

  return blob;
}

/**
 * Copy, paste and delete for the lasso's selection. A copy goes to the in-app clipboard,
 * which holds the elements and their images and pastes into any note, and as a PNG to the
 * system clipboard. A paste lands in the middle of the view and comes in selected.
 */
export function useCanvasClipboard(options: ClipboardOptions) {
  const { hostRef, sceneState, camera, images, isReadOnly, onPasted } = options;
  const { liveRef, selection, setSelection, commit } = sceneState;
  const { cameraRef, viewport } = camera;
  const clipboard = useSyncExternalStore(subscribeClipboard, getClipboard);

  const copy = useCallback(async () => {
    const { scene, files } = liveRef.current;
    const pagesById = layoutById(layoutPages(orderedPages(scene)));
    const content = copyElements(scene.elements.filter(isPlaced), selection, pagesById);
    if (!content) {
      return;
    }

    const marker = crypto.randomUUID();
    const portable = await Promise.all(
      content.fileIds.flatMap((id) => {
        const file = files.get(id);

        return file ? [portableFile(file)] : [];
      }),
    );
    const entry = { content, files: portable.flatMap((file) => file ?? []), marker };
    setClipboard(entry);

    // Best effort: a browser that refuses still pastes from the in-app clipboard.
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": selectionPng(entry, images),
          "text/plain": new Blob([MARKER_PREFIX + marker], { type: "text/plain" }),
        }),
      ]);
    } catch {
      // Nothing to tell anyone: the copy is on the in-app clipboard either way.
    }
  }, [images, liveRef, selection]);

  const paste = useCallback(
    (entry: ClipboardEntry | null = getClipboard()) => {
      if (!entry || isReadOnly) {
        return;
      }

      const { scene, files } = liveRef.current;
      const pages = layoutPages(orderedPages(scene));
      const center = toScene(cameraRef.current, { x: viewport.width / 2, y: viewport.height / 2 });
      const place = pastePlace(scene, pages, center);
      const top = sortByIndex(scene.elements).at(-1)?.index ?? null;
      const pasted = pasteElements(entry.content, place.at, top, place.pageId);
      commit(
        [...scene.elements, ...pasted],
        entry.files.filter((file) => !files.has(file.id)),
      );
      setSelection(new Set(pasted.map((element) => element.id)));
      onPasted();
    },
    [cameraRef, commit, isReadOnly, liveRef, onPasted, setSelection, viewport],
  );

  const remove = useCallback(() => {
    if (selection.size && !isReadOnly) {
      commit(removeElements(liveRef.current.scene.elements, selection));
      setSelection(new Set());
    }
  }, [commit, isReadOnly, liveRef, selection, setSelection]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || isReadOnly) {
      return;
    }

    // Captured, so it runs before the image paste and can claim the event from it.
    const onPaste = (event: ClipboardEvent) => {
      const entry = getClipboard();
      const text = event.clipboardData?.getData("text/plain") ?? "";
      const hasFiles = (event.clipboardData?.files.length ?? 0) > 0;
      if (entry && (text === MARKER_PREFIX + entry.marker || !hasFiles)) {
        event.preventDefault();
        paste(entry);
      }
    };
    host.addEventListener("paste", onPaste, true);

    return () => host.removeEventListener("paste", onPaste, true);
  }, [hostRef, isReadOnly, paste]);

  return {
    copy,
    paste: useCallback(() => paste(), [paste]),
    remove,
    canCopy: selection.size > 0,
    canPaste: clipboard !== null,
  };
}

export type CanvasClipboard = ReturnType<typeof useCanvasClipboard>;
