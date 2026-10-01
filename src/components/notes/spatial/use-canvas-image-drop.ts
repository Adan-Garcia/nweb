import { type RefObject, useCallback, useEffect } from "react";

import type { CanvasCamera } from "@/components/notes/spatial/use-canvas-camera";
import type { CanvasSceneState } from "@/components/notes/spatial/use-canvas-scene";
import { toScene, visibleRect } from "@/lib/canvas/camera";
import { contentFileId } from "@/lib/canvas/canvas-files";
import type { Point } from "@/lib/canvas/geometry";
import { placeImage } from "@/lib/canvas/media-placement";
import { layoutPages, orderedPages } from "@/lib/canvas/pages";

/** The pixel size of an image blob, or null if it will not decode. */
async function imageSize(url: string): Promise<{ width: number; height: number } | null> {
  return await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * Images dropped onto or pasted into the canvas: made smaller in the worker, given an id
 * from their bytes, and placed where they were dropped (or in the middle of the view).
 * Object URLs made here are released when the canvas goes away.
 */
export function useCanvasImageDrop({
  hostRef,
  sceneState,
  camera,
  optimizeImage,
  isReadOnly,
}: {
  hostRef: RefObject<HTMLElement | null>;
  sceneState: CanvasSceneState;
  camera: CanvasCamera;
  optimizeImage: (file: File) => Promise<Blob>;
  isReadOnly: boolean;
}) {
  const { liveRef, commit } = sceneState;
  const { cameraRef, viewport } = camera;

  const addImages = useCallback(
    async (files: readonly File[], at: Point | null, urls: string[]) => {
      const center = at ?? {
        x: visibleRect(cameraRef.current, viewport).x + viewport.width / 2 / cameraRef.current.zoom,
        y:
          visibleRect(cameraRef.current, viewport).y + viewport.height / 2 / cameraRef.current.zoom,
      };

      for (const file of files.filter((candidate) => candidate.type.startsWith("image/"))) {
        const blob = await optimizeImage(file);
        const url = URL.createObjectURL(blob);
        urls.push(url);
        const size = await imageSize(url);
        if (!size) {
          continue;
        }

        const fileId = await contentFileId(blob);
        const scene = liveRef.current.scene;
        const element = placeImage(
          scene,
          layoutPages(orderedPages(scene)),
          { fileId, ...size },
          center,
        );
        commit(
          [...scene.elements, element],
          [{ id: fileId, mimeType: blob.type || file.type, created: Date.now(), url, blob }],
        );
      }
    },
    [cameraRef, commit, liveRef, optimizeImage, viewport],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || isReadOnly) {
      return;
    }

    const urls: string[] = [];
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) {
        event.preventDefault();
      }
    };
    const onDrop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (!files.length) {
        return;
      }
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      const at = toScene(cameraRef.current, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      void addImages(files, at, urls);
    };
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) {
        event.preventDefault();
        void addImages(files, null, urls);
      }
    };

    host.addEventListener("dragover", onDragOver);
    host.addEventListener("drop", onDrop);
    host.addEventListener("paste", onPaste);

    return () => {
      host.removeEventListener("dragover", onDragOver);
      host.removeEventListener("drop", onDrop);
      host.removeEventListener("paste", onPaste);
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [addImages, cameraRef, hostRef, isReadOnly]);
}
