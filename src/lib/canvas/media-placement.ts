import { keysBetween } from "./fractional-index";
import type { Point } from "./geometry";
import { pageAt, type PlacedPage, toPagePoint } from "./pages";
import { indexOnTop } from "./scene-edits";
import type { ImageElement, Page, PageSize, Scene } from "./scene-model";

/** A PDF page rendered to an image, as the import hands it over. */
export type RenderedPage = { fileId: string; width: number; height: number };

const PAGE_RATIO: Record<PageSize, number> = { letter: 11 / 8.5, a4: 297 / 210 };

/** The paper closest to a PDF page's shape, turned the way the page is. */
export function paperFor(width: number, height: number): Pick<Page, "size" | "orientation"> {
  const ratio = Math.max(width, height) / Math.min(width, height);
  const size =
    Math.abs(ratio - PAGE_RATIO.letter) <= Math.abs(ratio - PAGE_RATIO.a4) ? "letter" : "a4";

  return { size, orientation: width > height ? "landscape" : "portrait" };
}

/**
 * Paged notes: each PDF page becomes a note page with the PDF drawn under the ink, placed
 * after `afterIndex` and before `beforeIndex` in the stack.
 */
export function pdfPagesAsPages(
  rendered: readonly RenderedPage[],
  afterIndex: string | null,
  beforeIndex: string | null,
  newId: () => string = () => crypto.randomUUID(),
): Page[] {
  const keys = keysBetween(afterIndex, beforeIndex, rendered.length);

  return rendered.map((page, i) => ({
    id: newId(),
    version: 1,
    index: keys[i],
    type: "page",
    ...paperFor(page.width, page.height),
    background: "blank",
    pdf: { fileId: page.fileId },
  }));
}

/** The largest a PDF page is placed on an infinite canvas, in scene units. */
const MAX_WIDTH = 1000;
const MAX_HEIGHT = 1400;
const GAP = 40;

/**
 * Infinite notes: the pages as images, stacked top to bottom and centred on `center`,
 * each scaled down to fit and placed above everything under `topIndex`.
 */
export function pdfPagesAsImages(
  rendered: readonly RenderedPage[],
  center: Point,
  topIndex: string | null,
  newId: () => string = () => crypto.randomUUID(),
): ImageElement[] {
  const sizes = rendered.map((page) => {
    const scale = Math.min(1, MAX_WIDTH / page.width, MAX_HEIGHT / page.height);

    return { width: page.width * scale, height: page.height * scale };
  });
  const total = sizes.reduce((sum, size) => sum + size.height, 0) + GAP * (sizes.length - 1);
  const keys = keysBetween(topIndex, null, rendered.length);
  let top = center.y - total / 2;

  return rendered.map((page, i) => {
    const { width, height } = sizes[i];
    const image: ImageElement = {
      id: newId(),
      version: 1,
      index: keys[i],
      type: "image",
      fileId: page.fileId,
      x: center.x - width / 2,
      y: top,
      width,
      height,
    };
    top += height + GAP;

    return image;
  });
}

/** The largest a dropped image is placed, in scene units; a photo can be far bigger. */
const MAX_IMAGE_SIZE = 800;

/**
 * Where a dropped or pasted image goes: centred on `at`, scaled down to fit, and onto the
 * page under that point in a paged note (or the first page, if it landed between pages).
 */
export function placeImage(
  scene: Pick<Scene, "layout" | "elements">,
  pages: readonly PlacedPage[],
  image: { fileId: string; width: number; height: number },
  at: Point,
  newId: () => string = () => crypto.randomUUID(),
): ImageElement {
  const scale = Math.min(1, MAX_IMAGE_SIZE / image.width, MAX_IMAGE_SIZE / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const placed = scene.layout === "paged" ? (pageAt(pages, at) ?? pages[0] ?? null) : null;
  const center = placed ? toPagePoint(placed, at) : at;

  return {
    id: newId(),
    version: 1,
    index: indexOnTop(scene.elements),
    type: "image",
    fileId: image.fileId,
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    ...(placed ? { pageId: placed.page.id } : {}),
  };
}
