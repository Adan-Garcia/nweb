import { useRef } from "react";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";
import type { RefObject } from "react";

import {
  isPdfEmbeddableUrl,
  MAX_PEN_WIDTH,
  MIN_PEN_WIDTH,
  PEN_WIDTH_STEP,
} from "@/components/notes/spatial-notes-editor-utils";
import { SpatialNotesToolbar } from "@/components/notes/spatial-notes-toolbar";
import type { NotesSpatialInitialData } from "@/components/notes/types";
import { useElementFullscreen } from "@/components/notes/use-element-fullscreen";
import { useExcalidrawPen } from "@/components/notes/use-excalidraw-pen";
import { usePdfImport } from "@/components/notes/use-pdf-import";

// `notes-canvas-shell` is a hook for the Excalidraw branding overrides in pages/notes.css.
// Breakpoint matches the original stylesheet (`max-width: 960px`); Tailwind's `max-[N]` is
// exclusive, hence 961.
const CANVAS_SHELL_CLASSES =
  "notes-canvas-shell grid h-[calc(100svh_-_18rem)] min-h-[calc(100svh_-_18rem)] grid-rows-[1fr] overflow-hidden " +
  "rounded-[1rem] border border-[color-mix(in_oklab,var(--border)_80%,transparent)] " +
  "bg-[color-mix(in_oklab,var(--card)_92%,var(--background))] " +
  "max-[961px]:h-[calc(100svh_-_16.6rem)] max-[961px]:min-h-[calc(100svh_-_16.6rem)] " +
  "[&:fullscreen]:h-svh [&:fullscreen]:min-h-svh [&:fullscreen]:rounded-none";

export function SpatialNotesEditor({
  isDark,
  hostRef,
  initialData,
  onChange,
  onPaste,
}: {
  isDark: boolean;
  hostRef: RefObject<HTMLDivElement | null>;
  initialData: NotesSpatialInitialData;
  onChange: NonNullable<ExcalidrawProps["onChange"]>;
  onPaste: NonNullable<ExcalidrawProps["onPaste"]>;
}) {
  const shellRef = useRef<HTMLElement | null>(null);
  const { isFullscreen, toggleFullscreen } = useElementFullscreen(shellRef);
  const { excalidrawApiRef, penWidth, applyPenWidth, handleExcalidrawApi } = useExcalidrawPen();
  const { pdfInputRef, isImportingPdf, openPdfPicker, handlePdfInputChange } =
    usePdfImport(excalidrawApiRef);

  return (
    <section className={CANVAS_SHELL_CLASSES} ref={shellRef}>
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handlePdfInputChange}
      />
      <div className="h-full min-h-0" ref={hostRef}>
        <Excalidraw
          theme={isDark ? "dark" : "light"}
          initialData={initialData}
          validateEmbeddable={isPdfEmbeddableUrl}
          excalidrawAPI={handleExcalidrawApi}
          onChange={onChange}
          onPaste={onPaste}
          renderTopRightUI={() => {
            return (
              <SpatialNotesToolbar
                penWidth={penWidth}
                isImportingPdf={isImportingPdf}
                isFullscreen={isFullscreen}
                minPenWidth={MIN_PEN_WIDTH}
                maxPenWidth={MAX_PEN_WIDTH}
                penWidthStep={PEN_WIDTH_STEP}
                onPenWidthChange={applyPenWidth}
                onUploadPdf={openPdfPicker}
                onToggleFullscreen={() => {
                  void toggleFullscreen();
                }}
              />
            );
          }}
        >
          <MainMenu>
            <MainMenu.Item onSelect={openPdfPicker}>Insert PDF (choose pages)</MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
          </MainMenu>
        </Excalidraw>
      </div>
    </section>
  );
}
