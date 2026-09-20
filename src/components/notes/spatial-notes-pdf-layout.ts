import type { BinaryFileData } from "@excalidraw/excalidraw/types";

import {
  createPngSceneFile,
  newSceneFileId,
} from "@/components/notes/excalidraw-adapter";
import {
  PDF_INSERT_MAX_HEIGHT,
  PDF_INSERT_MAX_WIDTH,
  type RenderedPdfPage,
} from "@/components/notes/spatial-notes-pdf";
import { fitWithinBounds } from "@/components/notes/spatial-notes-editor-utils";

const PAGE_GAP = 40;

export type PdfInsertViewport = {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
};

/**
 * Stacks rendered PDF pages vertically, centred on the viewport, and returns
 * the image elements plus the files backing them.
 */
export function layoutPdfPages({
  pages,
  viewport,
  created,
  createFileId = newSceneFileId,
}: {
  pages: RenderedPdfPage[];
  viewport: PdfInsertViewport;
  created: number;
  createFileId?: () => BinaryFileData["id"];
}) {
  const scenePages = pages.map((renderedPage) => {
    const sceneDimensions = fitWithinBounds(
      renderedPage.width,
      renderedPage.height,
      PDF_INSERT_MAX_WIDTH,
      PDF_INSERT_MAX_HEIGHT,
    );

    return {
      ...renderedPage,
      sceneWidth: sceneDimensions.width,
      sceneHeight: sceneDimensions.height,
    };
  });

  const totalStackHeight =
    scenePages.reduce((sum, page) => sum + page.sceneHeight, 0) +
    PAGE_GAP * (scenePages.length - 1);

  let currentY = viewport.scrollY + viewport.height / 2 - totalStackHeight / 2;

  const fileEntries: BinaryFileData[] = [];
  const imageSkeletons = scenePages.map((page) => {
    const fileId = createFileId();
    const x = viewport.scrollX + viewport.width / 2 - page.sceneWidth / 2;
    const y = currentY;
    currentY += page.sceneHeight + PAGE_GAP;

    fileEntries.push(createPngSceneFile(fileId, page.dataUrl, created));

    return {
      type: "image" as const,
      x,
      y,
      width: page.sceneWidth,
      height: page.sceneHeight,
      fileId,
    };
  });

  return { fileEntries, imageSkeletons };
}

/** The toast to show after inserting `pages`, or null when nothing needs saying. */
export function describePdfInsert(pages: RenderedPdfPage[]): string | null {
  if (pages.length > 1) {
    const firstPage = pages[0].pageNumber;
    const lastPage = pages[pages.length - 1].pageNumber;

    return `Inserted ${pages.length} pages (${firstPage}-${lastPage}).`;
  }

  if (pages[0].totalPages > 1) {
    return `Inserted page ${pages[0].pageNumber} of ${pages[0].totalPages}.`;
  }

  return null;
}
