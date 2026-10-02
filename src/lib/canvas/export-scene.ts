import { contentBounds } from "./element-bounds";
import { expandRect, type Point, type Rect } from "./geometry";
import { layoutById, pageAt, pageDimensions, type PlacedPage } from "./pages";
import type { CanvasTheme } from "./render-elements";
import { isPlaced } from "./scene-edits";
import type { Scene } from "./scene-model";

/**
 * What an export draws and on what paper. A scene unit is a CSS pixel (`pages.ts`), so a
 * page prints at 96 dpi to its size and a PDF point is three quarters of a unit.
 */
export type ExportSheet = { region: Rect; widthPt: number; heightPt: number };

export const POINTS_PER_UNIT = 0.75;

/** Space left around the ink of an infinite note, in scene units. */
const MARGIN = 24;

/**
 * An export is printed, so it is always drawn as on paper: the light inks on white, whatever
 * the theme on screen.
 */
export const PRINT_THEME: CanvasTheme = {
  dark: false,
  paper: "#ffffff",
  gap: "#ffffff",
  marks: "#9ca3af",
  selection: "#000000",
};

/** Everything drawn on an infinite note, with a margin; null for an empty one. */
function inkRegion(scene: Scene, pages: readonly PlacedPage[]): Rect | null {
  const bounds = contentBounds(scene.elements.filter(isPlaced), layoutById(pages));

  return bounds && expandRect(bounds, MARGIN);
}

/**
 * The picture a PNG export is: the page at `center` (or the first) of a paged note, all
 * the ink of an infinite one. Null when there is nothing to draw.
 */
export function pngRegion(scene: Scene, pages: readonly PlacedPage[], center: Point): Rect | null {
  if (scene.layout === "paged") {
    return (pageAt(pages, center) ?? pages[0])?.rect ?? null;
  }

  return inkRegion(scene, pages);
}

/** Letter, portrait: what the ink of an infinite note is laid out on. */
const SHEET = pageDimensions({ size: "letter", orientation: "portrait" });

/**
 * The pages of a PDF export. A paged note prints page for page, each on its own paper. An
 * infinite note's ink is scaled to the width of a Letter sheet when it is wider (never up),
 * then cut into as many sheets down as it takes.
 */
export function pdfSheets(scene: Scene, pages: readonly PlacedPage[]): ExportSheet[] {
  if (scene.layout === "paged") {
    return pages.map(({ rect }) => ({
      region: rect,
      widthPt: rect.width * POINTS_PER_UNIT,
      heightPt: rect.height * POINTS_PER_UNIT,
    }));
  }

  const ink = inkRegion(scene, pages);
  if (!ink) {
    return [];
  }

  const scale = Math.max(1, ink.width / SHEET.width);
  const width = SHEET.width * scale;
  const height = SHEET.height * scale;
  const x = ink.x - (width - ink.width) / 2;

  return Array.from({ length: Math.ceil(ink.height / height) }, (_, i) => ({
    region: { x, y: ink.y + i * height, width, height },
    widthPt: SHEET.width * POINTS_PER_UNIT,
    heightPt: SHEET.height * POINTS_PER_UNIT,
  }));
}
