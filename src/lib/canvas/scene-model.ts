import { z } from "zod";

import { CUSTOM_COLOR_PATTERN, INK_COLORS } from "./colors";
import { isOrderKey, keyBetween } from "./fractional-index";

/**
 * A drawing note, as it is stored: one JSON string, compressed and sealed by the notes
 * storage like any other payload. `docs/canvas.md` is the design.
 *
 * Three things about elements are relied on outside this folder (`lib/sync/merge-scene.ts`,
 * the media reference counting in `lib/notes/`): every element has an `id` and a `version`
 * bumped on every change, an `index` that sorts into stacking order, and a deleted element
 * is absent rather than flagged.
 */
export const SCENE_FORMAT = 1;

/** Values per sample in `Stroke.samples`: dx, dy, pressure, tiltX, tiltY, dt. */
export const SAMPLE_STRIDE = 6;

export const BACKGROUNDS = ["blank", "dots", "grid", "ruled"] as const;
export const PAGE_SIZES = ["letter", "a4"] as const;
export const SHAPE_KINDS = ["rectangle", "ellipse", "line"] as const;

export const colorSchema = z.union([z.enum(INK_COLORS), z.string().regex(CUSTOM_COLOR_PATTERN)]);
const backgroundSchema = z.enum(BACKGROUNDS);
const orderKeySchema = z.string().refine(isOrderKey, "Not an order key");

const identitySchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  index: orderKeySchema,
});

/** Anything drawn: placed in scene units, or relative to its page in a paged note. */
const placedSchema = identitySchema.extend({
  x: z.number(),
  y: z.number(),
  pageId: z.string().min(1).optional(),
  locked: z.boolean().optional(),
});

export const strokeSchema = placedSchema.extend({
  type: z.literal("stroke"),
  tool: z.enum(["pen", "highlighter"]),
  color: colorSchema,
  width: z.number().positive(),
  /**
   * How much pressure thins the line, from 0 (not at all) to 1. Absent on a highlighter,
   * which ignores pressure, and on a pen it means the default.
   */
  sensitivity: z.number().min(0).max(1).optional(),
  /**
   * How much the line was smoothed, 0 to 1: the setting when it was drawn, kept with it so
   * changing the setting changes the next line and never the ones already on the page.
   * Absent means the default.
   */
  smoothing: z.number().min(0).max(1).optional(),
  /**
   * The view's zoom when it was drawn. Smoothing works in screen pixels, where the hand's
   * jitter is, so a stroke drawn zoomed out is smoothed over more of the scene.
   */
  zoom: z.number().positive().optional(),
  samples: z
    .array(z.number())
    .min(SAMPLE_STRIDE)
    .refine((samples) => samples.length % SAMPLE_STRIDE === 0, "Incomplete sample"),
});

export const shapeSchema = placedSchema.extend({
  type: z.literal("shape"),
  kind: z.enum(SHAPE_KINDS),
  /** The bounding box; for a line, the vector from (x, y) to its other end. */
  width: z.number(),
  height: z.number(),
  rotation: z.number(),
  color: colorSchema,
  strokeWidth: z.number().positive(),
  fill: colorSchema.nullable(),
});

export const imageSchema = placedSchema.extend({
  type: z.literal("image"),
  /** A content hash for a dropped image, a random id for a rendered PDF page. */
  fileId: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
});

/** A page is an element too, so the merge adds, deletes and reorders pages for free. */
export const pageSchema = identitySchema.extend({
  type: z.literal("page"),
  size: z.enum(PAGE_SIZES),
  orientation: z.enum(["portrait", "landscape"]),
  background: backgroundSchema,
  /** The imported PDF page drawn under the ink. */
  pdf: z.object({ fileId: z.string().min(1) }).optional(),
});

export const sceneElementSchema = z.discriminatedUnion("type", [
  strokeSchema,
  shapeSchema,
  imageSchema,
  pageSchema,
]);

export const sceneSchema = z.object({
  format: z.literal(SCENE_FORMAT),
  layout: z.enum(["infinite", "paged"]),
  /** Infinite notes only; each page carries its own. */
  background: backgroundSchema.optional(),
  elements: z.array(sceneElementSchema),
  /** This device's view. Kept from the local side by the merge, never combined. */
  view: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }).optional(),
});

export type Background = (typeof BACKGROUNDS)[number];
export type PageSize = (typeof PAGE_SIZES)[number];
export type ShapeKind = (typeof SHAPE_KINDS)[number];
export type Stroke = z.infer<typeof strokeSchema>;
export type Shape = z.infer<typeof shapeSchema>;
export type ImageElement = z.infer<typeof imageSchema>;
export type Page = z.infer<typeof pageSchema>;
export type SceneElement = z.infer<typeof sceneElementSchema>;
export type PlacedElement = Exclude<SceneElement, Page>;
export type Scene = z.infer<typeof sceneSchema>;
export type SceneLayout = Scene["layout"];

export type SceneReadResult =
  { ok: true; scene: Scene } | { ok: false; reason: "invalid" | "newer-format" };

/**
 * Reads a stored scene. A scene this build cannot read is reported, never repaired: the
 * editor shows it read-only, because autosaving a guess would overwrite the real note.
 */
export function readScene(serialized: string): SceneReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "format" in parsed &&
    typeof parsed.format === "number" &&
    parsed.format > SCENE_FORMAT
  ) {
    return { ok: false, reason: "newer-format" };
  }

  const result = sceneSchema.safeParse(parsed);

  return result.success ? { ok: true, scene: result.data } : { ok: false, reason: "invalid" };
}

const round = (value: number, places: number) => {
  const factor = 10 ** places;

  return Math.round(value * factor) / factor;
};

/** Precision per sample field: position to 0.01, pressure to 0.001, tilt to 0.1°, time to 1 ms. */
const SAMPLE_PLACES = [2, 2, 3, 1, 1, 0];

function roundElement(element: SceneElement): SceneElement {
  if (element.type === "page") {
    return element;
  }

  const placed = { ...element, x: round(element.x, 2), y: round(element.y, 2) };
  if (placed.type === "stroke") {
    return {
      ...placed,
      ...(placed.zoom === undefined ? {} : { zoom: round(placed.zoom, 3) }),
      samples: placed.samples.map((value, i) => round(value, SAMPLE_PLACES[i % SAMPLE_STRIDE])),
    };
  }

  return placed;
}

/**
 * The stored form. Numbers are rounded first: a note is thousands of strokes of hundreds of
 * samples, and sixteen digits of each would triple what is compressed and synced.
 */
export function serializeScene(scene: Scene): string {
  return JSON.stringify({ ...scene, elements: scene.elements.map(roundElement) });
}

export function createPage(index: string, id: string = crypto.randomUUID()): Page {
  return {
    id,
    version: 1,
    index,
    type: "page",
    size: "letter",
    orientation: "portrait",
    background: "dots",
  };
}

/** A new, empty drawing: an infinite canvas, or a paged note with its first page. */
export function createScene(
  layout: SceneLayout,
  newId: () => string = () => crypto.randomUUID(),
): Scene {
  if (layout === "infinite") {
    return { format: SCENE_FORMAT, layout, background: "dots", elements: [] };
  }

  return {
    format: SCENE_FORMAT,
    layout,
    elements: [createPage(keyBetween(null, null), newId())],
  };
}
