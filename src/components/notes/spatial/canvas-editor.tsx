import { useRef } from "react";

import { CanvasMoreMenu } from "@/components/notes/spatial/canvas-more-menu";
import { CanvasSelectionBar } from "@/components/notes/spatial/canvas-selection-bar";
import { CanvasSurface } from "@/components/notes/spatial/canvas-surface";
import { CanvasToolbar } from "@/components/notes/spatial/canvas-toolbar";
import { PageThumbnails } from "@/components/notes/spatial/page-thumbnails";
import {
  type CanvasEditorOptions,
  useCanvasEditor,
} from "@/components/notes/spatial/use-canvas-editor";
import { cn } from "@/lib/utils";

const SHELL_CLASSES =
  "relative h-[calc(100svh_-_18rem)] min-h-[calc(100svh_-_18rem)] overflow-hidden rounded-[1rem] " +
  "border border-border bg-card max-[961px]:h-[calc(100svh_-_16.6rem)] " +
  "max-[961px]:min-h-[calc(100svh_-_16.6rem)] [&:fullscreen]:h-svh [&:fullscreen]:min-h-svh [&:fullscreen]:rounded-none";

/** Standing in for fullscreen where the browser will not grant it: over the whole window. */
const COVERING_CLASSES =
  "fixed inset-0 z-50 h-dvh min-h-dvh max-[961px]:h-dvh max-[961px]:min-h-dvh rounded-none border-0";

type CanvasEditorProps = Omit<CanvasEditorOptions, "shellRef" | "hostRef">;

/** The drawing canvas: toolbar, surface, and the hooks that tie them to one scene. */
export function CanvasEditor(props: CanvasEditorProps) {
  const shellRef = useRef<HTMLElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editor = useCanvasEditor({ ...props, shellRef, hostRef });
  const { sceneState, tools, fullscreen, pdfInputRef, onPdfChange, isCompact } = editor;
  const { isReadOnly } = props;

  return (
    <section
      ref={shellRef}
      className={cn(SHELL_CLASSES, fullscreen.isCovering && COVERING_CLASSES)}
    >
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
        isCompact={isCompact}
        canUndo={sceneState.canUndo}
        canRedo={sceneState.canRedo}
        onUndo={sceneState.undo}
        onRedo={sceneState.redo}
        isFullscreen={fullscreen.isFullscreen}
        onToggleFullscreen={editor.toggleFullscreen}
        onColorPicked={editor.pickColor}
        more={(close) => <CanvasMoreMenu actions={editor.more} onDone={close} />}
      />
      {editor.showPages ? (
        <PageThumbnails
          scene={sceneState.scene}
          pages={editor.pages}
          images={editor.images}
          isReadOnly={isReadOnly}
        />
      ) : null}
      <CanvasSurface
        hostRef={hostRef}
        sceneState={sceneState}
        camera={editor.camera}
        tools={tools}
        images={editor.images}
        inputSettings={editor.input.settings}
        isReadOnly={isReadOnly}
      />
      {tools.tool === "lasso" && !isReadOnly ? (
        <CanvasSelectionBar clipboard={editor.clipboard} />
      ) : null}
    </section>
  );
}
