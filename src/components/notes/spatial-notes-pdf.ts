import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import {
  fitWithinBounds,
  parsePdfPageSelection,
} from "@/components/notes/spatial-notes-editor-utils";

const PDF_RENDER_MAX_WIDTH = 1800;
const PDF_RENDER_MAX_HEIGHT = 2400;

export const PDF_INSERT_MAX_WIDTH = 1000;
export const PDF_INSERT_MAX_HEIGHT = 1400;

export type RenderedPdfPage = {
  dataUrl: string;
  width: number;
  height: number;
  pageNumber: number;
  totalPages: number;
};

export async function renderPdfPagesToPng(pdfFile: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const loadingTask = pdfjs.getDocument({
    data: await pdfFile.arrayBuffer(),
  });

  const pdf = await loadingTask.promise;

  try {
    let selectedPages = [1];

    if (pdf.numPages > 1) {
      const pageInput = window.prompt(
        `This PDF has ${pdf.numPages} pages. Enter pages (examples: 1, 3-5, all):`,
        "1",
      );

      if (pageInput === null) {
        return null;
      }

      selectedPages = parsePdfPageSelection(pageInput, pdf.numPages);
    }

    const renderedPages: RenderedPdfPage[] = [];

    for (const selectedPageNumber of selectedPages) {
      const page = await pdf.getPage(selectedPageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const renderDimensions = fitWithinBounds(
        viewport.width,
        viewport.height,
        PDF_RENDER_MAX_WIDTH,
        PDF_RENDER_MAX_HEIGHT,
      );

      const renderScale = renderDimensions.width / viewport.width;
      const scaledViewport = page.getViewport({ scale: renderScale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(scaledViewport.width));
      canvas.height = Math.max(1, Math.round(scaledViewport.height));

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Could not get a 2D canvas context.");
      }

      await page.render({
        canvas,
        canvasContext: context,
        viewport: scaledViewport,
      }).promise;

      renderedPages.push({
        dataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
        pageNumber: selectedPageNumber,
        totalPages: pdf.numPages,
      });
    }

    return renderedPages;
  } finally {
    await loadingTask.destroy();
  }
}
