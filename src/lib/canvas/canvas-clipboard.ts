import { elementBounds, pageOffset } from "./element-bounds";
import { keysBetween } from "./fractional-index";
import { type Point, type Rect, unionRects } from "./geometry";
import type { PlacedPage } from "./pages";
import type { PlacedElement } from "./scene-model";

/**
 * A copied selection. Elements are stored centred on (0, 0) with no page, so they can be
 * pasted into any note, on any page, at any place. Images are listed by file id; the note
 * they are pasted into needs those files too, and content-hashed ids mean the same picture
 * is still stored once.
 */
export type ClipboardContent = {
  elements: PlacedElement[];
  fileIds: string[];
  size: { width: number; height: number };
};

/** Copies `ids` out of a scene, or returns null when none of them can be placed. */
export function copyElements(
  elements: readonly PlacedElement[],
  ids: ReadonlySet<string>,
  pagesById: ReadonlyMap<string, PlacedPage>,
): ClipboardContent | null {
  const chosen = elements.filter((element) => ids.has(element.id));
  const placed = chosen.flatMap((element) => {
    const offset = pageOffset(element, pagesById);
    const bounds = elementBounds(element, pagesById);

    return offset && bounds ? [{ element, offset, bounds }] : [];
  });
  const box = unionRects(placed.map(({ bounds }) => bounds));
  if (!box) {
    return null;
  }

  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  return {
    elements: placed.map(({ element, offset }) => {
      const moved = {
        ...element,
        x: element.x + offset.x - center.x,
        y: element.y + offset.y - center.y,
      };
      delete moved.pageId;

      return moved;
    }),
    fileIds: [
      ...new Set(chosen.flatMap((element) => (element.type === "image" ? [element.fileId] : []))),
    ],
    size: { width: box.width, height: box.height },
  };
}

/**
 * The elements a paste adds: new ids, order keys above `topIndex` in the order they were
 * copied, centred on `at` in the target's space and on `pageId` when pasting onto a page.
 */
export function pasteElements(
  content: ClipboardContent,
  at: Point,
  topIndex: string | null,
  pageId?: string,
  newId: () => string = () => crypto.randomUUID(),
): PlacedElement[] {
  const keys = keysBetween(topIndex, null, content.elements.length);

  return content.elements.map((element, i) => ({
    ...element,
    id: newId(),
    version: 1,
    index: keys[i],
    x: element.x + at.x,
    y: element.y + at.y,
    ...(pageId ? { pageId } : {}),
  }));
}

/** The rectangle a paste at `at` would cover, for a preview or to pan it into view. */
export function pasteBounds(content: ClipboardContent, at: Point): Rect {
  return {
    x: at.x - content.size.width / 2,
    y: at.y - content.size.height / 2,
    ...content.size,
  };
}

/**
 * The in-app clipboard: the last copy, in memory for the tab, as the open note already is.
 * The system clipboard gets a PNG of the same selection (the canvas writes that), so a copy
 * also pastes into other apps.
 */
let current: ClipboardContent | null = null;

export function setClipboard(content: ClipboardContent | null): void {
  current = content;
}

export function getClipboard(): ClipboardContent | null {
  return current;
}
