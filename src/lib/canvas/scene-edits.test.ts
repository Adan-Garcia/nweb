import { describe, expect, it } from "vitest";

import {
  indexAbove,
  indexOnTop,
  isPlaced,
  recolorElements,
  referencedFileIds,
  removeElements,
  removePage,
  replaceElement,
  sortByIndex,
  translateElements,
} from "./scene-edits";
import { createPage, type ImageElement, type Stroke } from "./scene-model";

const stroke = (id: string, index: string, pageId?: string): Stroke => ({
  id,
  version: 1,
  index,
  type: "stroke",
  tool: "pen",
  color: "ink-black",
  width: 2,
  x: 0,
  y: 0,
  samples: [0, 0, 0.5, 0, 0, 0],
  ...(pageId ? { pageId } : {}),
});

const image: ImageElement = {
  id: "img",
  version: 4,
  index: "a3",
  type: "image",
  fileId: "photo",
  x: 5,
  y: 5,
  width: 10,
  height: 10,
};

describe("order", () => {
  it("sorts by index and finds the key on top and the next one up", () => {
    const elements = [stroke("b", "a2"), stroke("a", "a0"), stroke("c", "a5")];

    expect(sortByIndex(elements).map((element) => element.id)).toEqual(["a", "b", "c"]);
    expect(indexOnTop(elements) > "a5").toBe(true);
    expect(indexOnTop([])).toBe("a0");
    expect(indexAbove(elements, "a0")).toBe("a2");
    expect(indexAbove(elements, "a2")).toBe("a5");
    expect(indexAbove(elements, "a5")).toBeNull();
  });
});

describe("edits", () => {
  const elements = [createPage("a0", "page"), stroke("s", "a1", "page"), image];

  it("tells placed elements from pages", () => {
    expect(elements.filter(isPlaced).map((element) => element.id)).toEqual(["s", "img"]);
  });

  it("moves the chosen elements and bumps their versions, never a page", () => {
    const moved = translateElements(elements, new Set(["s", "page"]), 3, -2);

    expect(moved[1]).toMatchObject({ x: 3, y: -2, version: 2 });
    expect(moved[0]).toBe(elements[0]);
    expect(moved[2]).toBe(image);
  });

  it("recolours strokes and shapes but leaves images alone", () => {
    const recoloured = recolorElements(elements, new Set(["s", "img"]), "ink-red");

    expect(recoloured[1]).toMatchObject({ color: "ink-red", version: 2 });
    expect(recoloured[2]).toBe(image);
  });

  it("removes and replaces elements", () => {
    expect(removeElements(elements, new Set(["s"])).map((element) => element.id)).toEqual([
      "page",
      "img",
    ]);
    expect(
      replaceElement(elements, "s", [stroke("x", "a1"), stroke("y", "a1V")]).map(
        (element) => element.id,
      ),
    ).toEqual(["page", "x", "y", "img"]);
  });

  it("removes a page with everything written on it", () => {
    expect(removePage(elements, "page")).toEqual([image]);
  });

  it("lists every file the scene draws, images and PDF pages alike", () => {
    const withPdf = [
      { ...createPage("a0", "p"), pdf: { fileId: "pdf-1" } },
      image,
      stroke("s", "a1"),
    ];

    expect(referencedFileIds({ elements: withPdf })).toEqual(new Set(["pdf-1", "photo"]));
  });
});
