import { compareOrderKeys, keyBetween } from "./fractional-index";
import { type Point, type Rect, rectContains } from "./geometry";
import type { Page, PageSize, SceneElement } from "./scene-model";

/**
 * Paged notes: a vertical stack of Letter or A4 sheets. A scene unit is a CSS pixel, so a
 * page is its print size at 96 dpi and prints at 100%.
 */
const PAGE_PORTRAIT: Record<PageSize, { width: number; height: number }> = {
  letter: { width: 816, height: 1056 },
  a4: { width: 794, height: 1123 },
};

/** Space between pages in the stack, in scene units. */
export const PAGE_GAP = 32;

export type PlacedPage = { page: Page; rect: Rect };

export function pageDimensions(page: Pick<Page, "size" | "orientation">) {
  const { width, height } = PAGE_PORTRAIT[page.size];

  return page.orientation === "portrait" ? { width, height } : { width: height, height: width };
}

/** The pages of a scene in stack order. */
export function orderedPages(scene: { elements: readonly SceneElement[] }): Page[] {
  return scene.elements
    .filter((element): element is Page => element.type === "page")
    .sort((a, b) => compareOrderKeys(a.index, b.index));
}

/**
 * Where each page sits in scene space: stacked from y = 0 down, each centred on x = 0 so a
 * landscape page between portrait ones stays in line with them.
 */
export function layoutPages(pages: readonly Page[]): PlacedPage[] {
  let top = 0;

  return pages.map((page) => {
    const { width, height } = pageDimensions(page);
    const rect = { x: -width / 2, y: top, width, height };
    top += height + PAGE_GAP;

    return { page, rect };
  });
}

/** The page under a scene point, if any; a stroke started in a gap belongs to no page. */
export function pageAt(layout: readonly PlacedPage[], point: Point): PlacedPage | null {
  return layout.find(({ rect }) => rectContains(rect, point)) ?? null;
}

export function toPagePoint(placed: PlacedPage, point: Point): Point {
  return { x: point.x - placed.rect.x, y: point.y - placed.rect.y };
}

export function fromPagePoint(placed: PlacedPage, point: Point): Point {
  return { x: point.x + placed.rect.x, y: point.y + placed.rect.y };
}

/**
 * Where an element's origin is in scene space. Null for an element on a page that no
 * longer exists (possible after two devices' edits are merged); the caller decides what to
 * show rather than drawing it somewhere arbitrary.
 */
export function elementOrigin(
  element: Exclude<SceneElement, Page>,
  layoutById: ReadonlyMap<string, PlacedPage>,
): Point | null {
  if (!element.pageId) {
    return { x: element.x, y: element.y };
  }

  const placed = layoutById.get(element.pageId);

  return placed ? fromPagePoint(placed, element) : null;
}

export function layoutById(layout: readonly PlacedPage[]): Map<string, PlacedPage> {
  return new Map(layout.map((placed) => [placed.page.id, placed]));
}

/**
 * A new page after `afterId` (or at the end when it is null or unknown), copying the size,
 * orientation and background of the page it follows so a notebook stays uniform.
 */
export function insertPage(
  pages: readonly Page[],
  afterId: string | null,
  id: string = crypto.randomUUID(),
): Page {
  const position = afterId ? pages.findIndex((page) => page.id === afterId) : -1;
  const at = position === -1 ? pages.length - 1 : position;
  const before = pages[at] ?? null;
  const after = pages[at + 1] ?? null;

  return {
    id,
    version: 1,
    index: keyBetween(before?.index ?? null, after?.index ?? null),
    type: "page",
    size: before?.size ?? "letter",
    orientation: before?.orientation ?? "portrait",
    background: before?.background ?? "dots",
  };
}

/** The index that moves page `id` to position `to` in the stack; null if it goes nowhere. */
export function movedPageIndex(pages: readonly Page[], id: string, to: number): string | null {
  const from = pages.findIndex((page) => page.id === id);
  const target = Math.max(0, Math.min(to, pages.length - 1));
  if (from === -1 || from === target) {
    return null;
  }

  const others = pages.filter((page) => page.id !== id);
  const before = others[target - 1] ?? null;
  const after = others[target] ?? null;

  return keyBetween(before?.index ?? null, after?.index ?? null);
}

/** The scene with page `id` moved to position `to`; null if it goes nowhere. */
export function movePage(
  elements: readonly SceneElement[],
  id: string,
  to: number,
): SceneElement[] | null {
  const index = movedPageIndex(orderedPages({ elements }), id, to);
  if (index === null) {
    return null;
  }

  return elements.map((element) =>
    element.id === id ? { ...element, index, version: element.version + 1 } : element,
  );
}
