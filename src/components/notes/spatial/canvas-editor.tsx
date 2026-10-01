import { useCallback, useMemo, useRef } from "react";

import { CanvasSurface } from "@/components/notes/spatial/canvas-surface";
import { CanvasToolbar } from "@/components/notes/spatial/canvas-toolbar";
import { useCanvasCamera } from "@/components/notes/spatial/use-canvas-camera";
import { useCanvasImageDrop } from "@/components/notes/spatial/use-canvas-image-drop";
import { useCanvasPdfImport } from "@/components/notes/spatial/use-canvas-pdf-import";
import { useCanvasScene } from "@/components/notes/spatial/use-canvas-scene";
import { useCanvasShortcuts, useFitView } from "@/components/notes/spatial/use-canvas-shortcuts";
import { useCanvasTools } from "@/components/notes/spatial/use-canvas-tools";
import { useElementFullscreen } from "@/components/notes/spatial/use-element-fullscreen";
import type { SpatialSnapshot } from "@/components/notes/types";
import type { CanvasFiles } from "@/lib/canvas/canvas-files";
import { insertPage, layoutPages, orderedPages } from "@/lib/canvas/pages";
import { recolorElements } from "@/lib/canvas/scene-edits";
import type { Scene } from "@/lib/canvas/scene-model";
import { cn } from "@/lib/utils";

const SHELL_CLASSES =
  "relative h-[calc(100svh_-_18rem)] min-h-[calc(100svh_-_18rem)] overflow-hidden rounded-[1rem] " +
  "border border-border bg-card max-[961px]:h-[calc(100svh_-_16.6rem)] " +
  "max-[961px]:min-h-[calc(100svh_-_16.6rem)] [&:fullscreen]:h-svh [&:fullscreen]:min-h-svh [&:fullscreen]:rounded-none";

/** Standing in for fullscreen where the browser will not grant it: over the whole window. */
const COVERING_CLASSES =
  "fixed inset-0 z-50 h-dvh min-h-dvh max-[961px]:h-dvh max-[961px]:min-h-dvh rounded-none border-0";

type CanvasEditorProps = {
  initial: { scene: Scene; files: CanvasFiles };
  onChange: (snapshot: SpatialSnapshot) => void;
  optimizeImage: (file: File) => Promise<Blob>;
  isReadOnly: boolean;
};

/** The drawing canvas: toolbar, surface, and the hooks that tie them to one scene. */
export function CanvasEditor({ initial, onChange, optimizeImage, isReadOnly }: CanvasEditorProps) {
  const shellRef = useRef<HTMLElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneState = useCanvasScene(initial, onChange);
  const tools = useCanvasTools();
  const firstPage = useMemo(
    () => layoutPages(orderedPages(initial.scene))[0]?.rect ?? null,
    [initial.scene],
  );
  const camera = useCanvasCamera(hostRef, firstPage);
  const { isFullscreen, isCovering, toggleFullscreen } = useElementFullscreen(shellRef);
  const {
    inputRef: pdfInputRef,
    isImporting: isImportingPdf,
    openPicker: openPdfPicker,
    onInputChange: onPdfChange,
  } = useCanvasPdfImport(sceneState, camera);
  const fitView = useFitView(sceneState, camera);
  const { liveRef, selection, commit } = sceneState;

  useCanvasImageDrop({ hostRef, sceneState, camera, optimizeImage, isReadOnly });
  useCanvasShortcuts({
    hostRef,
    sceneState,
    tool: tools.tool,
    setTool: tools.setTool,
    fitView,
    isReadOnly,
  });

  const addPage = useCallback(() => {
    const elements = liveRef.current.scene.elements;
    commit([...elements, insertPage(orderedPages({ elements }), null)]);
  }, [commit, liveRef]);

  /** A colour picked with something selected recolours it, as well as the tool. */
  const pickColor = useCallback(
    (color: string) => {
      tools.setColor(color);
      if (selection.size) {
        commit(recolorElements(liveRef.current.scene.elements, selection, color));
      }
    },
    [commit, liveRef, selection, tools],
  );

  return (
    <section ref={shellRef} className={cn(SHELL_CLASSES, isCovering && COVERING_CLASSES)}>
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        aria-label="PDF to insert"
        onChange={onPdfChange}
      />
      <CanvasToolbar
        tools={tools}
        isReadOnly={isReadOnly}
        canUndo={sceneState.canUndo}
        canRedo={sceneState.canRedo}
        onUndo={sceneState.undo}
        onRedo={sceneState.redo}
        onAddPage={sceneState.scene.layout === "paged" ? addPage : undefined}
        onImportPdf={openPdfPicker}
        isImportingPdf={isImportingPdf}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => void toggleFullscreen()}
        onColorPicked={pickColor}
      />
      <CanvasSurface
        hostRef={hostRef}
        sceneState={sceneState}
        camera={camera}
        tools={tools}
        isReadOnly={isReadOnly}
      />
    </section>
  );
}
