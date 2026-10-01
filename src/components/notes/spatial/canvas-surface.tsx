import { type RefObject, useMemo, useRef, useState } from "react";

import type { CanvasCamera } from "@/components/notes/spatial/use-canvas-camera";
import { useCanvasImages } from "@/components/notes/spatial/use-canvas-images";
import { useCanvasPointer } from "@/components/notes/spatial/use-canvas-pointer";
import { useCanvasRenderer } from "@/components/notes/spatial/use-canvas-renderer";
import type { CanvasSceneState } from "@/components/notes/spatial/use-canvas-scene";
import type { CanvasTools } from "@/components/notes/spatial/use-canvas-tools";
import { useCanvasTouchGuard } from "@/components/notes/spatial/use-canvas-touch-guard";
import { useCanvasWheel } from "@/components/notes/spatial/use-canvas-wheel";
import type { InputSettings } from "@/lib/canvas/input-filter";
import { layoutById, layoutPages, orderedPages } from "@/lib/canvas/pages";
import { selectionBounds } from "@/lib/canvas/select-gestures";

/** Until the settings to change it arrive, fingers draw until a pen has been seen. */
const INPUT_SETTINGS: InputSettings = { fingerDraws: "auto", stylusOnly: false };

type CanvasSurfaceProps = {
  hostRef: RefObject<HTMLDivElement | null>;
  sceneState: CanvasSceneState;
  camera: CanvasCamera;
  tools: CanvasTools;
  isReadOnly: boolean;
};

/**
 * Two canvases, one over the other: the scene, redrawn when it changes, and a live layer
 * for the gesture in progress, redrawn every frame of it. The live layer takes the input.
 */
export function CanvasSurface({
  hostRef,
  sceneState,
  camera,
  tools,
  isReadOnly,
}: CanvasSurfaceProps) {
  const sceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const { scene, files, selection } = sceneState;

  const pages = useMemo(() => layoutPages(orderedPages(scene)), [scene]);
  const pagesById = useMemo(() => layoutById(pages), [pages]);
  const selectionBox = useMemo(
    () => (selection.size ? selectionBounds({ scene, pagesById }, selection) : null),
    [pagesById, scene, selection],
  );
  const images = useCanvasImages(files);

  const { drawLive } = useCanvasRenderer({
    hostRef,
    sceneCanvasRef,
    liveCanvasRef,
    scene,
    pages,
    pagesById,
    camera: camera.camera,
    viewport: camera.viewport,
    images,
    hidden,
    selectionBox,
  });
  const handlers = useCanvasPointer({
    surfaceRef: liveCanvasRef,
    sceneState,
    camera,
    tool: tools.tool,
    style: tools.style,
    settings: INPUT_SETTINGS,
    isReadOnly,
    drawLive,
    setHidden,
  });
  useCanvasWheel(liveCanvasRef, camera);
  useCanvasTouchGuard(liveCanvasRef);

  return (
    <div
      ref={hostRef}
      // Focusable so keyboard shortcuts and pasted images reach it.
      tabIndex={0}
      className="relative size-full min-h-0 touch-none overflow-hidden outline-none select-none [-webkit-touch-callout:none]"
    >
      <canvas ref={sceneCanvasRef} aria-hidden className="absolute inset-0 size-full" />
      <canvas
        ref={liveCanvasRef}
        role="img"
        aria-label={isReadOnly ? "Drawing (read only)" : "Drawing canvas"}
        className="absolute inset-0 size-full"
        onPointerDown={(event) => {
          hostRef.current?.focus({ preventScroll: true });
          handlers.onPointerDown(event);
        }}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerCancel}
      />
    </div>
  );
}
