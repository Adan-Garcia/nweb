import { describe, expect, it } from "vitest";

import { paperFor, pdfPagesAsImages, pdfPagesAsPages, placeImage } from "./media-placement";
import { layoutPages } from "./pages";
import { createPage, createScene } from "./scene-model";

const ids = () => {
  let next = 0;
  return () => `id-${(next += 1)}`;
};

describe("paperFor", () => {
  it("picks the paper a PDF page is shaped like, turned the same way", () => {
    expect(paperFor(612, 792)).toEqual({ size: "letter", orientation: "portrait" });
    expect(paperFor(842, 595)).toEqual({ size: "a4", orientation: "landscape" });
  });
});

describe("pdfPagesAsPages", () => {
  it("makes each rendered page a note page with the PDF under it, in order", () => {
    const pages = pdfPagesAsPages(
      [
        { fileId: "f1", width: 612, height: 792 },
        { fileId: "f2", width: 595, height: 842 },
      ],
      "a0",
      null,
      ids(),
    );

    expect(pages.map(({ id, size, background, pdf }) => ({ id, size, background, pdf }))).toEqual([
      { id: "id-1", size: "letter", background: "blank", pdf: { fileId: "f1" } },
      { id: "id-2", size: "a4", background: "blank", pdf: { fileId: "f2" } },
    ]);
    expect(pages[0].index > "a0" && pages[0].index < pages[1].index).toBe(true);
    expect(pdfPagesAsPages([{ fileId: "f", width: 1, height: 2 }], null, null)[0].id).toMatch(/-/);
  });
});

describe("pdfPagesAsImages", () => {
  it("stacks the pages centred on a point, scaled down to fit", () => {
    const images = pdfPagesAsImages(
      [
        { fileId: "f1", width: 2000, height: 1000 },
        { fileId: "f2", width: 500, height: 700 },
      ],
      { x: 0, y: 0 },
      "a5",
      ids(),
    );

    expect(images[0]).toMatchObject({ fileId: "f1", width: 1000, height: 500, x: -500 });
    expect(images[1]).toMatchObject({ fileId: "f2", width: 500, height: 700, x: -250 });
    expect(images[1].y).toBe(images[0].y + 500 + 40);
    expect(images[0].y + (500 + 40 + 700) / 2).toBeCloseTo(0);
    expect(images[0].index > "a5").toBe(true);
    expect(
      pdfPagesAsImages([{ fileId: "f", width: 1, height: 1 }], { x: 0, y: 0 }, null)[0].id,
    ).toMatch(/-/);
  });
});

describe("placeImage", () => {
  it("centres an image where it was dropped on an infinite canvas, no larger than 800", () => {
    const element = placeImage(
      createScene("infinite"),
      [],
      { fileId: "f", width: 1600, height: 400 },
      { x: 100, y: 100 },
      ids(),
    );

    expect(element).toMatchObject({
      id: "id-1",
      fileId: "f",
      width: 800,
      height: 200,
      x: -300,
      y: 0,
    });
    expect(element).not.toHaveProperty("pageId");
  });

  it("puts an image on the page it was dropped on, or the first page from a gap", () => {
    const scene = {
      layout: "paged" as const,
      elements: [createPage("a0", "p1"), createPage("a1", "p2")],
    };
    const pages = layoutPages([createPage("a0", "p1"), createPage("a1", "p2")]);

    const onSecond = placeImage(
      scene,
      pages,
      { fileId: "f", width: 100, height: 100 },
      { x: 0, y: 1500 },
    );
    expect(onSecond).toMatchObject({ pageId: "p2", x: 408 - 50 });

    const inGap = placeImage(
      scene,
      pages,
      { fileId: "f", width: 100, height: 100 },
      { x: 0, y: 1070 },
    );
    expect(inGap.pageId).toBe("p1");
  });

  it("leaves an image unplaced on a paged note with no pages left", () => {
    const element = placeImage(
      { layout: "paged", elements: [] },
      [],
      { fileId: "f", width: 10, height: 10 },
      { x: 0, y: 0 },
    );

    expect(element).not.toHaveProperty("pageId");
  });
});
