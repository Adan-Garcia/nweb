import { afterEach, describe, expect, it, vi } from "vitest";

import {
  copyElements,
  getClipboard,
  pasteBounds,
  pasteElements,
  pastePlace,
  setClipboard,
  subscribeClipboard,
} from "./canvas-clipboard";
import { layoutById, layoutPages } from "./pages";
import { createPage, type ImageElement, type Shape } from "./scene-model";

const pages = layoutById(layoutPages([createPage("a0", "p1")]));

const box: Shape = {
  id: "b",
  version: 5,
  index: "a3",
  type: "shape",
  kind: "rectangle",
  x: 0,
  y: 0,
  width: 40,
  height: 20,
  rotation: 0,
  color: "ink-black",
  strokeWidth: 2,
  fill: null,
};

const image: ImageElement = {
  id: "i",
  version: 2,
  index: "a4",
  type: "image",
  fileId: "hash",
  x: 100,
  y: 0,
  width: 20,
  height: 20,
};

afterEach(() => setClipboard(null));

describe("copyElements", () => {
  it("copies the chosen elements centred on the origin, with no page", () => {
    const content = copyElements(
      [box, image, { ...image, id: "other" }],
      new Set(["b", "i"]),
      new Map(),
    );

    expect(content?.size).toEqual({ width: 121, height: 22 });
    expect(content?.fileIds).toEqual(["hash"]);
    expect(content?.elements.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: "b", x: -59.5, y: -10 },
      { id: "i", x: 40.5, y: -10 },
    ]);
  });

  it("takes an element off its page into scene space", () => {
    const content = copyElements([{ ...box, pageId: "p1" }], new Set(["b"]), pages);

    expect(content?.elements[0]).not.toHaveProperty("pageId");
    expect(content?.elements[0]).toMatchObject({ x: -20, y: -10 });
  });

  it("has nothing to copy when nothing chosen can be placed", () => {
    expect(copyElements([box], new Set(), pages)).toBeNull();
    expect(copyElements([{ ...box, pageId: "gone" }], new Set(["b"]), pages)).toBeNull();
  });
});

describe("pasteElements", () => {
  const content = copyElements([box, image], new Set(["b", "i"]), new Map());

  it("adds copies with new ids, on top, centred where asked", () => {
    const ids = ["n1", "n2"];
    const pasted = content
      ? pasteElements(content, { x: 500, y: 500 }, "a9", undefined, () => ids.shift() ?? "")
      : [];

    expect(pasted.map(({ id, version, x, y }) => ({ id, version, x, y }))).toEqual([
      { id: "n1", version: 1, x: 440.5, y: 490 },
      { id: "n2", version: 1, x: 540.5, y: 490 },
    ]);
    expect(pasted[0].index > "a9" && pasted[0].index < pasted[1].index).toBe(true);
    expect(pasted[0]).not.toHaveProperty("pageId");
  });

  it("puts a paste onto a page when given one", () => {
    const pasted = content ? pasteElements(content, { x: 0, y: 0 }, null, "p1") : [];

    expect(pasted.every((element) => element.pageId === "p1")).toBe(true);
    expect(pasted[0].id).not.toBe("b");
  });

  it("reports the area a paste would cover", () => {
    expect(content && pasteBounds(content, { x: 0, y: 0 })).toEqual({
      x: -60.5,
      y: -11,
      width: 121,
      height: 22,
    });
  });
});

describe("where a paste lands", () => {
  const pages = layoutPages([createPage("a0", "p1"), createPage("a1", "p2")]);

  it("lands in the middle of the view on an infinite note", () => {
    expect(pastePlace({ layout: "infinite" }, [], { x: 5, y: 6 })).toEqual({ at: { x: 5, y: 6 } });
  });

  it("lands on the page in view, or the nearest one, inside its edges", () => {
    expect(pastePlace({ layout: "paged" }, pages, { x: 0, y: 100 })).toEqual({
      at: { x: 408, y: 100 },
      pageId: "p1",
    });
    expect(pastePlace({ layout: "paged" }, pages, { x: 9000, y: 1080 })).toEqual({
      at: { x: 816, y: 0 },
      pageId: "p2",
    });
    expect(pastePlace({ layout: "paged" }, [], { x: 1, y: 2 })).toEqual({ at: { x: 1, y: 2 } });
  });
});

describe("the in-app clipboard", () => {
  it("holds the last copy and tells whoever listens that it changed", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeClipboard(listener);
    expect(getClipboard()).toBeNull();
    const content = copyElements([box], new Set(["b"]), new Map());
    const entry = content && { content, files: [], marker: "copy-1" };
    setClipboard(entry);
    expect(getClipboard()).toBe(entry);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setClipboard(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
