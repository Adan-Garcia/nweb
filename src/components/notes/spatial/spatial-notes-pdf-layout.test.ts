import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import { describe, expect, it } from "vitest";

import { newSceneFileId } from "./excalidraw-adapter";
import type { RenderedPdfPage } from "./spatial-notes-pdf";
import { describePdfInsert, layoutPdfPages } from "./spatial-notes-pdf-layout";

function page(pageNumber: number, totalPages: number, width = 500, height = 700): RenderedPdfPage {
  return { dataUrl: `data:image/png;base64,p${pageNumber}`, width, height, pageNumber, totalPages };
}

const viewport = { scrollX: 100, scrollY: 200, width: 1000, height: 800 };

function sequentialIds() {
  let next = 0;
  const ids: BinaryFileData["id"][] = [];
  return {
    ids,
    create: () => {
      const id = newSceneFileId();
      ids.push(id);
      next += 1;
      return id;
    },
    count: () => next,
  };
}

describe("layoutPdfPages", () => {
  it("centres a single page on the viewport", () => {
    const { imageSkeletons } = layoutPdfPages({ pages: [page(1, 1)], viewport, created: 5 });

    const [image] = imageSkeletons;
    expect(image).toMatchObject({ type: "image", width: 500, height: 700 });
    expect(image.x).toBe(100 + 1000 / 2 - 500 / 2);
    expect(image.y).toBe(200 + 800 / 2 - 700 / 2);
  });

  it("stacks pages downward with a 40px gap, centred as a group", () => {
    const { imageSkeletons } = layoutPdfPages({
      pages: [page(1, 2), page(2, 2)],
      viewport,
      created: 5,
    });

    const totalHeight = 700 + 700 + 40;
    expect(imageSkeletons[0].y).toBe(200 + 800 / 2 - totalHeight / 2);
    expect(imageSkeletons[1].y).toBe(imageSkeletons[0].y + 700 + 40);
  });

  it("shrinks oversized pages to fit within the insert bounds, keeping the aspect ratio", () => {
    const { imageSkeletons } = layoutPdfPages({
      pages: [page(1, 1, 3000, 2000)],
      viewport,
      created: 5,
    });

    const [image] = imageSkeletons;
    expect(image.width).toBeLessThanOrEqual(1000);
    expect(image.height).toBeLessThanOrEqual(1400);
    expect(image.width / image.height).toBeCloseTo(3000 / 2000, 1); // sizes are rounded to whole pixels
  });

  it("creates one file per page, linked to its image by id", () => {
    const ids = sequentialIds();
    const { fileEntries, imageSkeletons } = layoutPdfPages({
      pages: [page(1, 2), page(2, 2)],
      viewport,
      created: 1234,
      createFileId: ids.create,
    });

    expect(ids.count()).toBe(2);
    expect(new Set(ids.ids).size).toBe(2);
    expect(fileEntries.map((file) => file.id)).toEqual(ids.ids);
    expect(imageSkeletons.map((image) => image.fileId)).toEqual(ids.ids);
    expect(fileEntries[0]).toMatchObject({
      mimeType: "image/png",
      created: 1234,
      dataURL: "data:image/png;base64,p1",
    });
    expect(fileEntries[1].dataURL).toBe("data:image/png;base64,p2");
  });
});

describe("describePdfInsert", () => {
  it("summarizes a multi-page insert", () => {
    expect(describePdfInsert([page(3, 9), page(4, 9), page(5, 9)])).toBe("Inserted 3 pages (3-5).");
  });

  it("names the single page inserted from a longer document", () => {
    expect(describePdfInsert([page(4, 9)])).toBe("Inserted page 4 of 9.");
  });

  it("stays quiet for a one-page document", () => {
    expect(describePdfInsert([page(1, 1)])).toBeNull();
  });
});
