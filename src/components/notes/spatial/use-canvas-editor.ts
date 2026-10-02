import { type RefObject, useCallback, useMemo, useState } from "react";

import type { CanvasMoreActions } from "@/components/notes/spatial/canvas-more-menu";
import { useCanvasCamera } from "@/components/notes/spatial/use-canvas-camera";
import { useCanvasClipboard } from "@/components/notes/spatial/use-canvas-clipboard";
import { useCanvasExport } from "@/components/notes/spatial/use-canvas-export";
import { useCanvasHistoryStorage } from "@/components/notes/spatial/use-canvas-history-storage";
import { useCanvasImageDrop } from "@/components/notes/spatial/use-canvas-image-drop";
import { useCanvasImages } from "@/components/notes/spatial/use-canvas-images";
import { useCanvasInputSettings } from "@/components/notes/spatial/use-canvas-input-settings";
import { useCanvasPages } from "@/components/notes/spatial/use-canvas-pages";
import { useCanvasPdfImport } from "@/components/notes/spatial/use-canvas-pdf-import";
import { useCanvasScene } from "@/components/notes/spatial/use-canvas-scene";
import { useCanvasShortcuts, useFitView } from "@/components/notes/spatial/use-canvas-shortcuts";
import { useCanvasTools } from "@/components/notes/spatial/use-canvas-tools";
import { useElementFullscreen } from "@/components/notes/spatial/use-element-fullscreen";
import type { SpatialSnapshot } from "@/components/notes/types";
import type { CanvasFiles } from "@/lib/canvas/canvas-files";
import { layoutPages, orderedPages } from "@/lib/canvas/pages";
import { recolorElements } from "@/lib/canvas/scene-edits";
import type { Scene } from "@/lib/canvas/scene-model";

/** Narrower than this, the toolbar drops to its one-row phone layout. */
const COMPACT_WIDTH = 640;

export type CanvasEditorOptions = {
  shellRef: RefObject<HTMLElement | null>;
  hostRef: RefObject<HTMLDivElement | null>;
  documentId: string | null;
  initial: { scene: Scene; files: CanvasFiles };
  onChange: (snapshot: SpatialSnapshot) => void;
  optimizeImage: (file: File) => Promise<Blob>;
  isReadOnly: boolean;
};

/** Every hook the canvas is made of, tied to one scene, for `CanvasEditor` to lay out. */
export function useCanvasEditor(options: CanvasEditorOptions) {
  const { shellRef, hostRef, documentId, initial, onChange, optimizeImage, isReadOnly } = options;
  const sceneState = useCanvasScene(initial, onChange);
  const tools = useCanvasTools();
  const firstPage = useMemo(
    () => layoutPages(orderedPages(initial.scene))[0]?.rect ?? null,
    [initial.scene],
  );
  const camera = useCanvasCamera(hostRef, firstPage);
  const fullscreen = useElementFullscreen(shellRef);
  const pdf = useCanvasPdfImport(sceneState, camera);
  const fitView = useFitView(sceneState, camera);
  const images = useCanvasImages(sceneState.files);
  const input = useCanvasInputSettings();
  const pages = useCanvasPages(sceneState, camera);
  const [showPages, setShowPages] = useState(false);
  const { setTool } = tools;
  const onPasted = useCallback(() => setTool("lasso"), [setTool]);
  const clipboard = useCanvasClipboard({
    hostRef,
    sceneState,
    camera,
    images,
    isReadOnly,
    onPasted,
  });
  const exporter = useCanvasExport({ sceneState, camera, images });
  const { liveRef, selection, commit } = sceneState;

  useCanvasHistoryStorage(documentId, sceneState, isReadOnly);
  useCanvasImageDrop({ hostRef, sceneState, camera, optimizeImage, isReadOnly });
  useCanvasShortcuts({
    hostRef,
    sceneState,
    clipboard,
    tool: tools.tool,
    setTool,
    fitView,
    isReadOnly,
  });

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

  const isPaged = sceneState.scene.layout === "paged";
  const isCompact = camera.viewport.width > 0 && camera.viewport.width < COMPACT_WIDTH;
  const toggleFullscreen = useCallback(() => void fullscreen.toggleFullscreen(), [fullscreen]);
  const more: CanvasMoreActions = {
    onFit: fitView,
    pages: isPaged
      ? { isShown: showPages, onToggle: () => setShowPages((shown) => !shown), onAdd: pages.add }
      : undefined,
    onImportPdf: pdf.openPicker,
    isImportingPdf: pdf.isImporting,
    onExportPng: () => void exporter.exportPng(),
    onExportPdf: () => void exporter.exportPdf(),
    isExporting: exporter.isExporting,
    onToggleFullscreen: isCompact ? toggleFullscreen : undefined,
    input,
    isReadOnly,
  };

  return {
    sceneState,
    tools,
    camera,
    fullscreen,
    toggleFullscreen,
    pdfInputRef: pdf.inputRef,
    onPdfChange: pdf.onInputChange,
    images,
    input,
    clipboard,
    pages,
    showPages: isPaged && showPages,
    pickColor,
    isCompact,
    more,
  };
}
