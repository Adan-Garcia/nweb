import { memo, useEffect, useRef } from "react";

import { readCanvasTheme } from "@/components/notes/spatial/canvas-theme";
import type { PlacedPage } from "@/lib/canvas/pages";
import type { OutlineCache } from "@/lib/canvas/render-elements";
import { renderScene } from "@/lib/canvas/render-scene";
import type { PlacedElement } from "@/lib/canvas/scene-model";
import { cn } from "@/lib/utils";

/** A thumbnail's width on screen, in CSS pixels. */
const THUMBNAIL_WIDTH = 88;

type PageThumbnailProps = {
  placed: PlacedPage;
  number: number;
  /** What is written on this page, and nothing else. */
  elements: readonly PlacedElement[];
  images: ReadonlyMap<string, CanvasImageSource>;
  cache: OutlineCache;
  isDark: boolean;
  isCurrent: boolean;
  onSelect: (placed: PlacedPage) => void;
};

/** One page, drawn small through the same renderer as the canvas. */
function PageThumbnailView(props: PageThumbnailProps) {
  const { placed, elements, images, cache, isDark } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { rect } = placed;
  const height = Math.round((THUMBNAIL_WIDTH * rect.height) / rect.width);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const scale = THUMBNAIL_WIDTH / rect.width;
    canvas.width = Math.round(THUMBNAIL_WIDTH * dpr);
    canvas.height = Math.round(height * dpr);
    renderScene(
      ctx,
      { format: 1, layout: "paged", elements: [placed.page, ...elements] },
      [placed],
      {
        camera: { x: rect.x, y: rect.y, zoom: scale },
        viewport: { width: THUMBNAIL_WIDTH, height },
        dpr,
        theme: readCanvasTheme(canvas, isDark),
        images,
        cache,
      },
    );
  }, [cache, elements, height, images, isDark, placed, rect]);

  return (
    <button
      type="button"
      aria-label={`Page ${props.number}`}
      aria-current={props.isCurrent ? "page" : undefined}
      onClick={() => props.onSelect(placed)}
      className={cn(
        "flex shrink-0 flex-col items-center gap-1 rounded-lg p-1 text-caption text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        props.isCurrent && "bg-muted text-foreground",
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="rounded-sm border border-border"
        style={{ width: THUMBNAIL_WIDTH, height }}
      />
      {props.number}
    </button>
  );
}

const signature = (props: PageThumbnailProps) =>
  `${props.placed.page.version}:${props.placed.rect.y}:${props.number}:${props.isCurrent}:` +
  `${props.isDark}:${props.images.size}:` +
  props.elements.map((element) => `${element.id}@${element.version}`).join(",");

/**
 * Redrawn only when what is on the page changes (or how it is drawn), not on every change
 * to the note: a stroke on page 3 leaves the other thumbnails as they are.
 */
export const PageThumbnail = memo(
  PageThumbnailView,
  (previous, next) =>
    previous.onSelect === next.onSelect && signature(previous) === signature(next),
);
