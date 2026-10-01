import { useCallback, useState } from "react";
import { format } from "date-fns";

import { canvasBlob, rasterize } from "@/components/notes/spatial/canvas-raster";
import type { CanvasCamera } from "@/components/notes/spatial/use-canvas-camera";
import type { CanvasSceneState } from "@/components/notes/spatial/use-canvas-scene";
import { toScene } from "@/lib/canvas/camera";
import { pdfSheets, pngRegion, POINTS_PER_UNIT } from "@/lib/canvas/export-scene";
import { layoutPages, orderedPages } from "@/lib/canvas/pages";
import { type PdfPage, writePdf } from "@/lib/canvas/pdf-writer";
import { downloadBlob } from "@/lib/media/blob-utils";
import { notifyError, notifyInfo } from "@/lib/toast";

/** A PNG is for the screen: two pixels per unit stays sharp on a high-density display. */
const PNG_SCALE = 2;

/** A PDF page is printed: 150 dpi, at 96 units to the inch. */
const PDF_SCALE = 150 / 96;

const fileName = (extension: string) => `drawing-${format(new Date(), "yyyy-MM-dd")}.${extension}`;

/**
 * Exports the open drawing as a PNG (the page in view of a paged note, all the ink of an
 * infinite one) or a PDF (page for page, or the ink cut into Letter sheets), drawn as on
 * paper whatever the theme. `docs/canvas.md` ("Scope") has what each covers.
 */
export function useCanvasExport({
  sceneState,
  camera,
  images,
}: {
  sceneState: Pick<CanvasSceneState, "liveRef">;
  camera: Pick<CanvasCamera, "cameraRef" | "viewport">;
  images: ReadonlyMap<string, CanvasImageSource>;
}) {
  const { liveRef } = sceneState;
  const { cameraRef, viewport } = camera;
  const [isExporting, setIsExporting] = useState(false);

  const run = useCallback(async (work: () => Promise<boolean>) => {
    setIsExporting(true);
    try {
      if (!(await work())) {
        notifyInfo("Nothing to export yet", "Draw something first.");
      }
    } catch {
      notifyError("Could not export the drawing");
    } finally {
      setIsExporting(false);
    }
  }, []);

  const exportPng = useCallback(
    () =>
      run(async () => {
        const scene = liveRef.current.scene;
        const pages = layoutPages(orderedPages(scene));
        const center = toScene(cameraRef.current, {
          x: viewport.width / 2,
          y: viewport.height / 2,
        });
        const region = pngRegion(scene, pages, center);
        if (!region) {
          return false;
        }

        const canvas = rasterize(scene, pages, region, PNG_SCALE, {
          images,
          opaque: true,
        });
        const blob = await canvasBlob(canvas, "image/png");
        if (!blob) {
          throw new Error("The drawing could not be encoded.");
        }
        downloadBlob(blob, fileName("png"));

        return true;
      }),
    [cameraRef, images, liveRef, run, viewport],
  );

  const exportPdf = useCallback(
    () =>
      run(async () => {
        const scene = liveRef.current.scene;
        const pages = layoutPages(orderedPages(scene));
        const sheets = pdfSheets(scene, pages);
        if (!sheets.length) {
          return false;
        }

        const pdfPages: PdfPage[] = [];
        for (const sheet of sheets) {
          // At least the print resolution of the paper, whatever scale the region is at.
          const scale = (PDF_SCALE * sheet.widthPt) / POINTS_PER_UNIT / sheet.region.width;
          const canvas = rasterize(scene, pages, sheet.region, scale, {
            images,
            opaque: true,
          });
          const jpeg = await canvasBlob(canvas, "image/jpeg");
          if (!jpeg) {
            throw new Error("A page could not be encoded.");
          }
          pdfPages.push({
            width: sheet.widthPt,
            height: sheet.heightPt,
            jpeg: new Uint8Array(await jpeg.arrayBuffer()),
            pixelWidth: canvas.width,
            pixelHeight: canvas.height,
          });
        }
        downloadBlob(new Blob([writePdf(pdfPages)], { type: "application/pdf" }), fileName("pdf"));

        return true;
      }),
    [images, liveRef, run],
  );

  return { exportPng, exportPdf, isExporting };
}

export type CanvasExport = ReturnType<typeof useCanvasExport>;
