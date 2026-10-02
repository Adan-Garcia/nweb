import { backgroundMarks } from "./backgrounds";
import { type Camera, type Viewport, visibleRect } from "./camera";
import { type Rect, rectsIntersect } from "./geometry";
import type { PlacedPage } from "./pages";
import {
  cachedBounds,
  type CanvasTheme,
  drawElement,
  type DrawingContext,
  layerOf,
  type OutlineCache,
} from "./render-elements";
import { cornerPoint, CORNERS } from "./resize-gestures";
import { isPlaced, sortByIndex } from "./scene-edits";
import type { Background, PlacedElement, Scene } from "./scene-model";

/** A selection's corner handles, in screen pixels. */
const HANDLE_SIZE = 9;

export type RenderOptions = {
  camera: Camera;
  viewport: Viewport;
  /** Device pixels per CSS pixel; the canvas is that much larger than it looks. */
  dpr: number;
  theme: CanvasTheme;
  images: ReadonlyMap<string, CanvasImageSource>;
  cache: OutlineCache;
};

function applyCamera(ctx: DrawingContext, { camera, dpr }: RenderOptions) {
  const scale = camera.zoom * dpr;
  ctx.setTransform(scale, 0, 0, scale, -camera.x * scale, -camera.y * scale);
}

function drawMarks(
  ctx: DrawingContext,
  background: Background,
  area: Rect,
  options: RenderOptions,
) {
  const marks = backgroundMarks(background, area, options.camera.zoom);
  if (marks.kind === "none") {
    return;
  }

  ctx.save();
  // The muted text colour, faded: a pattern to write over, not something to read.
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = options.theme.marks;
  ctx.strokeStyle = options.theme.marks;
  ctx.lineWidth = 1 / options.camera.zoom;
  ctx.beginPath();
  if (marks.kind === "dots") {
    const size = 1.5 / Math.max(options.camera.zoom, 0.5);
    for (const { x, y } of marks.points) {
      ctx.rect(x - size / 2, y - size / 2, size, size);
    }
    ctx.fill();
  } else {
    for (const [from, to] of marks.segments) {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Elements in draw order, skipping hidden ones and those outside `area`. */
function drawLayered(
  ctx: DrawingContext,
  elements: readonly PlacedElement[],
  area: Rect,
  options: RenderOptions,
) {
  const visible = elements.filter((element) =>
    rectsIntersect(cachedBounds(element, options.cache), area),
  );
  for (const layer of [0, 1, 2]) {
    for (const element of visible) {
      if (layerOf(element) === layer) {
        drawElement(ctx, element, options);
      }
    }
  }
}

/** Draws the pages in view, each with its background, PDF and ink, clipped to the sheet. */
function drawPages(
  ctx: DrawingContext,
  pages: readonly PlacedPage[],
  elements: readonly PlacedElement[],
  view: Rect,
  options: RenderOptions,
) {
  ctx.fillStyle = options.theme.gap;
  ctx.fillRect(view.x, view.y, view.width, view.height);

  for (const { page, rect } of pages) {
    if (!rectsIntersect(rect, view)) {
      continue;
    }

    ctx.save();
    ctx.transform(1, 0, 0, 1, rect.x, rect.y);
    ctx.beginPath();
    ctx.rect(0, 0, rect.width, rect.height);
    ctx.clip();
    ctx.fillStyle = options.theme.paper;
    ctx.fillRect(0, 0, rect.width, rect.height);

    const pdf = page.pdf ? options.images.get(page.pdf.fileId) : undefined;
    if (pdf) {
      ctx.drawImage(pdf, 0, 0, rect.width, rect.height);
    }

    const local = {
      x: view.x - rect.x,
      y: view.y - rect.y,
      width: view.width,
      height: view.height,
    };
    drawMarks(ctx, page.background, local, options);
    drawLayered(
      ctx,
      elements.filter((element) => element.pageId === page.id),
      local,
      options,
    );
    ctx.restore();
  }
}

/**
 * Draws a whole scene onto a canvas the size of `viewport` times `dpr`. Pure apart from
 * the context it draws on and the outline cache it fills.
 */
export function renderScene(
  ctx: DrawingContext,
  scene: Scene,
  pages: readonly PlacedPage[],
  options: RenderOptions & { hidden?: ReadonlySet<string>; selection?: Rect | null },
) {
  ctx.setTransform(options.dpr, 0, 0, options.dpr, 0, 0);
  ctx.clearRect(0, 0, options.viewport.width, options.viewport.height);
  applyCamera(ctx, options);

  const view = visibleRect(options.camera, options.viewport);
  const elements = sortByIndex(scene.elements.filter(isPlaced)).filter(
    (element) => !options.hidden?.has(element.id),
  );

  if (scene.layout === "paged") {
    drawPages(ctx, pages, elements, view, options);
    drawLayered(
      ctx,
      elements.filter((element) => !element.pageId),
      view,
      options,
    );
  } else {
    drawMarks(ctx, scene.background ?? "blank", view, options);
    drawLayered(ctx, elements, view, options);
  }

  if (options.selection) {
    drawSelectionBox(ctx, options.selection, options);
  }
}

function drawSelectionBox(ctx: DrawingContext, box: Rect, options: RenderOptions) {
  ctx.save();
  ctx.strokeStyle = options.theme.selection;
  ctx.lineWidth = 1.5 / options.camera.zoom;
  ctx.setLineDash([6 / options.camera.zoom, 4 / options.camera.zoom]);
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  // Corner handles to resize by, a fixed size on screen whatever the zoom.
  const size = HANDLE_SIZE / options.camera.zoom;
  ctx.setLineDash([]);
  ctx.fillStyle = options.theme.paper;
  ctx.beginPath();
  for (const corner of CORNERS) {
    const { x, y } = cornerPoint(box, corner);
    ctx.rect(x - size / 2, y - size / 2, size, size);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * The live layer: the gesture in progress, drawn over the scene without redrawing it.
 * Elements on a page are placed (and clipped) by that page.
 */
export function renderPreview(
  ctx: DrawingContext,
  preview: {
    elements: readonly PlacedElement[];
    lasso: readonly { x: number; y: number }[] | null;
  },
  pagesById: ReadonlyMap<string, PlacedPage>,
  options: RenderOptions,
) {
  ctx.setTransform(options.dpr, 0, 0, options.dpr, 0, 0);
  ctx.clearRect(0, 0, options.viewport.width, options.viewport.height);
  applyCamera(ctx, options);

  for (const element of preview.elements) {
    const placed = element.pageId ? pagesById.get(element.pageId) : undefined;
    ctx.save();
    if (placed) {
      ctx.transform(1, 0, 0, 1, placed.rect.x, placed.rect.y);
      ctx.beginPath();
      ctx.rect(0, 0, placed.rect.width, placed.rect.height);
      ctx.clip();
    }
    drawElement(ctx, element, options);
    ctx.restore();
  }

  if (preview.lasso && preview.lasso.length > 1) {
    ctx.save();
    ctx.strokeStyle = options.theme.selection;
    ctx.lineWidth = 1.5 / options.camera.zoom;
    ctx.setLineDash([4 / options.camera.zoom, 4 / options.camera.zoom]);
    ctx.beginPath();
    ctx.moveTo(preview.lasso[0].x, preview.lasso[0].y);
    for (const point of preview.lasso.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}
