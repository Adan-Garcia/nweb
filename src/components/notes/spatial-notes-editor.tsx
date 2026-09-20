import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";
import { useRef } from "react";
import type { RefObject } from "react";

import {
  MAX_PEN_WIDTH,
  MIN_PEN_WIDTH,
  PEN_WIDTH_STEP,
  isPdfEmbeddableUrl,
} from "@/components/notes/spatial-notes-editor-utils";
import { SpatialNotesToolbar } from "@/components/notes/spatial-notes-toolbar";
import type { NotesSpatialInitialData } from "@/components/notes/types";
import { useElementFullscreen } from "@/components/notes/use-element-fullscreen";
import { useExcalidrawPen } from "@/components/notes/use-excalidraw-pen";
import { usePdfImport } from "@/components/notes/use-pdf-import";

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
  const { excalidrawApiRef, penWidth, applyPenWidth, handleExcalidrawApi } =
    useExcalidrawPen();
  const { pdfInputRef, isImportingPdf, openPdfPicker, handlePdfInputChange } =
    usePdfImport(excalidrawApiRef);

  return (
    <section className="notes-canvas-shell" ref={shellRef}>
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handlePdfInputChange}
      />
      <div className="notes-excalidraw-host" ref={hostRef}>
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
            <MainMenu.Item onSelect={openPdfPicker}>
              Insert PDF (choose pages)
            </MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
          </MainMenu>
        </Excalidraw>
      </div>
    </section>
  );
}
