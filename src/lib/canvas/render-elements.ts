import { resolveColor } from "./colors";
import { localBounds } from "./element-bounds";
import type { Rect } from "./geometry";
import type { PlacedElement, Shape, Stroke } from "./scene-model";
import { strokeBounds, strokeOutline } from "./stroke-geometry";

/** The part of a 2D context the canvas draws with; a test can hand in a recording fake. */
export type DrawingContext = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "setTransform"
  | "transform"
  | "clearRect"
  | "fillRect"
  | "strokeRect"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "quadraticCurveTo"
  | "closePath"
  | "fill"
  | "stroke"
  | "rect"
  | "arc"
  | "ellipse"
  | "clip"
  | "drawImage"
  | "setLineDash"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineCap"
  | "lineJoin"
  | "globalAlpha"
>;

/** Theme colours the canvas needs, read from the design tokens where it is mounted. */
export type CanvasTheme = {
  dark: boolean;
  /** A page sheet. */
  paper: string;
  /** Around the pages of a paged note. */
  gap: string;
  /** Dots, grid and ruled lines. */
  marks: string;
  /** The selection box and the lasso. */
  selection: string;
};

/**
 * Stroke outlines, kept so a still scene is not re-outlined. Checked against the samples
 * array itself, not only the version: a stroke being drawn keeps its id and version while
 * its samples grow, and its first one-sample outline must not stand in for the rest.
 */
export type OutlineCache = Map<
  string,
  {
    version: number;
    samples: readonly number[];
    outline: Array<[number, number]>;
    bounds: Rect;
  }
>;

/**
 * Traces a closed outline through the midpoints of its edges, with each point as the
 * control of a curve between them. Joining the points with straight lines shows facets
 * wherever the outline bends faster than it was sampled.
 */
function traceSmoothOutline(
  ctx: DrawingContext,
  outline: ReadonlyArray<[number, number]>,
  origin: { x: number; y: number },
) {
  const mid = (a: [number, number], b: [number, number]) => [
    origin.x + (a[0] + b[0]) / 2,
    origin.y + (a[1] + b[1]) / 2,
  ];
  const [startX, startY] = mid(outline[outline.length - 1], outline[0]);

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  outline.forEach((point, i) => {
    const [x, y] = mid(point, outline[(i + 1) % outline.length]);
    ctx.quadraticCurveTo(origin.x + point[0], origin.y + point[1], x, y);
  });
  ctx.closePath();
}

function outlineOf(stroke: Stroke, cache: OutlineCache) {
  const cached = cache.get(stroke.id);
  if (cached?.version === stroke.version && cached.samples === stroke.samples) {
    return cached;
  }

  const entry = {
    version: stroke.version,
    samples: stroke.samples,
    outline: strokeOutline(stroke),
    bounds: strokeBounds(stroke),
  };
  cache.set(stroke.id, entry);

  return entry;
}

/** Bounds in the element's own space, from the cache for strokes. */
export function cachedBounds(element: PlacedElement, cache: OutlineCache): Rect {
  return element.type === "stroke" ? outlineOf(element, cache).bounds : localBounds(element);
}

function drawStroke(ctx: DrawingContext, stroke: Stroke, theme: CanvasTheme, cache: OutlineCache) {
  const { outline } = outlineOf(stroke, cache);
  if (!outline.length) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = stroke.tool === "highlighter" ? 0.35 : 1;
  ctx.fillStyle = resolveColor(stroke.color, theme.dark);
  traceSmoothOutline(ctx, outline, stroke);
  ctx.fill();
  ctx.restore();
}

function drawShape(ctx: DrawingContext, shape: Shape, theme: CanvasTheme) {
  ctx.save();
  ctx.strokeStyle = resolveColor(shape.color, theme.dark);
  ctx.lineWidth = shape.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  if (shape.kind === "line") {
    ctx.moveTo(shape.x, shape.y);
    ctx.lineTo(shape.x + shape.width, shape.y + shape.height);
  } else {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    if (shape.kind === "ellipse") {
      ctx.ellipse(
        cx,
        cy,
        Math.abs(shape.width) / 2,
        Math.abs(shape.height) / 2,
        shape.rotation,
        0,
        Math.PI * 2,
      );
    } else {
      const cos = Math.cos(shape.rotation);
      const sin = Math.sin(shape.rotation);
      ctx.transform(cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy);
      ctx.rect(shape.x, shape.y, shape.width, shape.height);
    }
    if (shape.fill) {
      ctx.fillStyle = resolveColor(shape.fill, theme.dark);
      ctx.fill();
    }
  }

  ctx.stroke();
  ctx.restore();
}

/**
 * Draws one element in its own space. An image whose file has not loaded yet is outlined,
 * so a note never looks emptier than it is while its pictures decode.
 */
export function drawElement(
  ctx: DrawingContext,
  element: PlacedElement,
  options: {
    theme: CanvasTheme;
    images: ReadonlyMap<string, CanvasImageSource>;
    cache: OutlineCache;
  },
) {
  if (element.type === "stroke") {
    drawStroke(ctx, element, options.theme, options.cache);
    return;
  }
  if (element.type === "shape") {
    drawShape(ctx, element, options.theme);
    return;
  }

  const image = options.images.get(element.fileId);
  if (image) {
    ctx.drawImage(image, element.x, element.y, element.width, element.height);
    return;
  }

  ctx.save();
  ctx.strokeStyle = options.theme.marks;
  ctx.lineWidth = 1;
  ctx.strokeRect(element.x, element.y, element.width, element.height);
  ctx.restore();
}

/** Draw order within a layer: images under highlighter under ink and shapes. */
export function layerOf(element: PlacedElement): number {
  if (element.type === "image") {
    return 0;
  }

  return element.type === "stroke" && element.tool === "highlighter" ? 1 : 2;
}
