import { describe, expect, it } from "vitest";

import { pdfSheets, pngRegion, POINTS_PER_UNIT } from "./export-scene";
import { layoutPages, orderedPages } from "./pages";
import { createPage, createScene, type ImageElement, type Scene } from "./scene-model";

const image = (x: number, y: number, width: number, height: number): ImageElement => ({
  id: `img-${x}-${y}`,
  version: 1,
  index: "a1",
  type: "image",
  fileId: "f",
  x,
  y,
  width,
  height,
});

const paged: Scene = {
  format: 1,
  layout: "paged",
  elements: [
    createPage("a0", "p1"),
    { ...createPage("a1", "p2"), size: "a4", orientation: "landscape" },
  ],
};
const pagedLayout = layoutPages(orderedPages(paged));

describe("PNG export", () => {
  it("draws the page in the middle of the view, or the first when none is", () => {
    expect(pngRegion(paged, pagedLayout, { x: 0, y: 1200 })).toEqual(pagedLayout[1].rect);
    expect(pngRegion(paged, pagedLayout, { x: 5000, y: 0 })).toEqual(pagedLayout[0].rect);
    expect(pngRegion({ ...paged, elements: [] }, [], { x: 0, y: 0 })).toBeNull();
  });

  it("draws all the ink of an infinite note with a margin, and nothing for an empty one", () => {
    const scene = { ...createScene("infinite"), elements: [image(0, 0, 100, 50)] };

    expect(pngRegion(scene, [], { x: 0, y: 0 })).toEqual({
      x: -24,
      y: -24,
      width: 148,
      height: 98,
    });
    expect(pngRegion(createScene("infinite"), [], { x: 0, y: 0 })).toBeNull();
  });
});

describe("PDF export", () => {
  it("prints a paged note page for page, each on its own paper", () => {
    const sheets = pdfSheets(paged, pagedLayout);

    expect(sheets.map((sheet) => sheet.region)).toEqual(pagedLayout.map((page) => page.rect));
    expect(sheets[0]).toMatchObject({ widthPt: 612, heightPt: 792 });
    expect(sheets[1].widthPt).toBeCloseTo(1123 * POINTS_PER_UNIT);
  });

  it("cuts the ink of a narrow infinite note into Letter sheets down, centred", () => {
    const scene = { ...createScene("infinite"), elements: [image(0, 0, 352, 2000)] };
    const sheets = pdfSheets(scene, []);

    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toEqual({
      region: { x: -232, y: -24, width: 816, height: 1056 },
      widthPt: 612,
      heightPt: 792,
    });
    expect(sheets[1].region.y).toBe(1032);
  });

  it("shrinks wide ink to the sheet's width, and has nothing to print for an empty note", () => {
    const scene = { ...createScene("infinite"), elements: [image(0, 0, 1584, 100)] };
    const [sheet] = pdfSheets(scene, []);

    expect(sheet.region).toEqual({ x: -24, y: -24, width: 1632, height: 2112 });
    expect(sheet.widthPt).toBe(612);
    expect(pdfSheets(createScene("infinite"), [])).toEqual([]);
  });
});
