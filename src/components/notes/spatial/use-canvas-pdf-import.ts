import { type ChangeEvent, useCallback, useRef, useState } from "react";

import {
  describePdfInsert,
  renderPdfPagesToPng,
} from "@/components/notes/spatial/spatial-notes-pdf";
import type { CanvasCamera } from "@/components/notes/spatial/use-canvas-camera";
import type { CanvasSceneState } from "@/components/notes/spatial/use-canvas-scene";
import { visibleRect } from "@/lib/canvas/camera";
import type { CanvasFile } from "@/lib/canvas/canvas-files";
import { pdfPagesAsImages, pdfPagesAsPages } from "@/lib/canvas/media-placement";
import { orderedPages } from "@/lib/canvas/pages";
import { indexOnTop } from "@/lib/canvas/scene-edits";
import { notifyError, notifySuccess } from "@/lib/toast";

/**
 * Picking a PDF and adding the pages chosen from it: as note pages to write over in a
 * paged note, as images in the middle of the view on an infinite one.
 */
export function useCanvasPdfImport(sceneState: CanvasSceneState, camera: CanvasCamera) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { liveRef, commit } = sceneState;
  const { cameraRef, viewport } = camera;

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const insert = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        notifyError("Please choose a PDF file.");
        return;
      }

      setIsImporting(true);
      try {
        const rendered = await renderPdfPagesToPng(file);
        if (!rendered?.length) {
          return;
        }

        const created = Date.now();
        const files: CanvasFile[] = await Promise.all(
          rendered.map(async (page) => {
            const blob = await (await fetch(page.dataUrl)).blob();

            return {
              id: crypto.randomUUID(),
              mimeType: "image/png",
              created,
              url: page.dataUrl,
              blob,
            };
          }),
        );
        const pages = rendered.map((page, i) => ({
          fileId: files[i].id,
          width: page.width,
          height: page.height,
        }));
        const scene = liveRef.current.scene;
        const view = visibleRect(cameraRef.current, viewport);
        const added =
          scene.layout === "paged"
            ? pdfPagesAsPages(pages, orderedPages(scene).at(-1)?.index ?? null, null)
            : pdfPagesAsImages(
                pages,
                { x: view.x + view.width / 2, y: view.y + view.height / 2 },
                indexOnTop(scene.elements),
              );
        commit([...scene.elements, ...added], files);

        const message = describePdfInsert(rendered);
        if (message) {
          notifySuccess(message);
        }
      } catch {
        notifyError("Could not import PDF. Use a valid page selection like 1, 3-5, or all.");
      } finally {
        setIsImporting(false);
      }
    },
    [cameraRef, commit, liveRef, viewport],
  );

  const onInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) {
        void insert(file);
      }
    },
    [insert],
  );

  return { inputRef, isImporting, openPicker, onInputChange };
}
