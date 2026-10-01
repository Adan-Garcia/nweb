import { compareOrderKeys, keyBetween } from "./fractional-index";
import type { PlacedElement, Scene, SceneElement } from "./scene-model";

/**
 * Small, pure edits every tool is made of. Each changed element gets its version bumped,
 * which is what tells the merge (and undo) that it changed.
 */
export function sortByIndex<T extends SceneElement>(elements: readonly T[]): T[] {
  return [...elements].sort((a, b) => compareOrderKeys(a.index, b.index));
}

/** The key for something added on top of everything. */
export function indexOnTop(elements: readonly SceneElement[]): string {
  const top = elements.reduce<string | null>(
    (highest, element) =>
      highest === null || compareOrderKeys(element.index, highest) > 0 ? element.index : highest,
    null,
  );

  return keyBetween(top, null);
}

/** The first key above `index`, or null when `index` is on top. */
export function indexAbove(elements: readonly SceneElement[], index: string): string | null {
  return elements.reduce<string | null>(
    (lowest, element) =>
      compareOrderKeys(element.index, index) > 0 &&
      (lowest === null || compareOrderKeys(element.index, lowest) < 0)
        ? element.index
        : lowest,
    null,
  );
}

export function isPlaced(element: SceneElement): element is PlacedElement {
  return element.type !== "page";
}

/** Replaces the elements whose ids are in `updates`, bumping their versions. */
export function updateElements(
  elements: readonly SceneElement[],
  ids: ReadonlySet<string>,
  update: (element: PlacedElement) => PlacedElement,
): SceneElement[] {
  return elements.map((element) =>
    isPlaced(element) && ids.has(element.id)
      ? { ...update(element), version: element.version + 1 }
      : element,
  );
}

export function removeElements(
  elements: readonly SceneElement[],
  ids: ReadonlySet<string>,
): SceneElement[] {
  return elements.filter((element) => !ids.has(element.id));
}

export function translateElements(
  elements: readonly SceneElement[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): SceneElement[] {
  return updateElements(elements, ids, (element) => ({
    ...element,
    x: element.x + dx,
    y: element.y + dy,
  }));
}

/** Recolours strokes and shapes; images have no colour and are left alone. */
export function recolorElements(
  elements: readonly SceneElement[],
  ids: ReadonlySet<string>,
  color: string,
): SceneElement[] {
  return elements.map((element) =>
    (element.type === "stroke" || element.type === "shape") && ids.has(element.id)
      ? { ...element, color, version: element.version + 1 }
      : element,
  );
}

/** Replaces one element with others at the same place in the list. */
export function replaceElement(
  elements: readonly SceneElement[],
  id: string,
  replacements: readonly SceneElement[],
): SceneElement[] {
  return elements.flatMap((element) => (element.id === id ? replacements : [element]));
}

/** Every file a scene draws: dropped images and the PDF pages under paged notes. */
export function referencedFileIds(scene: Pick<Scene, "elements">): Set<string> {
  const ids = new Set<string>();
  for (const element of scene.elements) {
    if (element.type === "image") {
      ids.add(element.fileId);
    }
    if (element.type === "page" && element.pdf) {
      ids.add(element.pdf.fileId);
    }
  }

  return ids;
}

/** Deletes a page and everything written on it. */
export function removePage(elements: readonly SceneElement[], pageId: string): SceneElement[] {
  return elements.filter(
    (element) => element.id !== pageId && !(isPlaced(element) && element.pageId === pageId),
  );
}
