import {
  convertToExcalidrawElements,
  Excalidraw,
  MainMenu,
} from "@excalidraw/excalidraw";
import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import {
  DEFAULT_PEN_WIDTH,
  MAX_PEN_WIDTH,
  MIN_PEN_WIDTH,
  PEN_WIDTH_STEP,
  clampPenWidth,
  fitWithinBounds,
  isPdfEmbeddableUrl,
} from "@/components/notes/spatial-notes-editor-utils";
import {
  PDF_INSERT_MAX_HEIGHT,
  PDF_INSERT_MAX_WIDTH,
  renderPdfPagesToPng,
} from "@/components/notes/spatial-notes-pdf";
import { SpatialNotesToolbar } from "@/components/notes/spatial-notes-toolbar";
import type { NotesSpatialInitialData } from "@/components/notes/types";

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
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const onChangeUnsubscribeRef = useRef<(() => void) | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isImportingPdf, setIsImportingPdf] = useState(false);
  const [penWidth, setPenWidth] = useState(DEFAULT_PEN_WIDTH);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    if (!shellRef.current) {
      return;
    }

    try {
      if (document.fullscreenElement === shellRef.current) {
        await document.exitFullscreen();
        return;
      }

      await shellRef.current.requestFullscreen();
    } catch {
      return;
    }
  }, []);

  const applyPenWidth = useCallback((nextWidth: number) => {
    const clampedWidth = clampPenWidth(nextWidth);
    setPenWidth(clampedWidth);

    const api = excalidrawApiRef.current;
    if (!api) {
      return;
    }

    api.updateScene({
      appState: {
        currentItemStrokeWidth: clampedWidth,
      },
    });
  }, []);

  const openPdfPicker = useCallback(() => {
    pdfInputRef.current?.click();
  }, []);

  const insertPdfFile = useCallback(async (file: File) => {
    const api = excalidrawApiRef.current;
    if (!api) {
      return;
    }

    const isLikelyPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isLikelyPdf) {
      api.setToast({ message: "Please choose a PDF file." });
      return;
    }

    setIsImportingPdf(true);

    try {
      const renderedPages = await renderPdfPagesToPng(file);

      if (!renderedPages?.length) {
        return;
      }

      const appState = api.getAppState();
      const now = Date.now();
      const pageGap = 40;

      const scenePages = renderedPages.map((renderedPage) => {
        const sceneDimensions = fitWithinBounds(
          renderedPage.width,
          renderedPage.height,
          PDF_INSERT_MAX_WIDTH,
          PDF_INSERT_MAX_HEIGHT,
        );

        return {
          ...renderedPage,
          sceneWidth: sceneDimensions.width,
          sceneHeight: sceneDimensions.height,
        };
      });

      const totalStackHeight =
        scenePages.reduce((sum, page) => sum + page.sceneHeight, 0) +
        pageGap * (scenePages.length - 1);

      let currentY =
        appState.scrollY + appState.height / 2 - totalStackHeight / 2;

      const fileEntries: BinaryFileData[] = [];
      const imageSkeletons = scenePages.map((page) => {
        const fileId = crypto.randomUUID() as BinaryFileData["id"];
        const x = appState.scrollX + appState.width / 2 - page.sceneWidth / 2;
        const y = currentY;
        currentY += page.sceneHeight + pageGap;

        fileEntries.push({
          id: fileId,
          mimeType: "image/png",
          dataURL: page.dataUrl as BinaryFileData["dataURL"],
          created: now,
        });

        return {
          type: "image" as const,
          x,
          y,
          width: page.sceneWidth,
          height: page.sceneHeight,
          fileId,
        };
      });

      const imageElements = convertToExcalidrawElements(imageSkeletons);
      const selectedElementIds = imageElements.reduce<Record<string, true>>(
        (selectedIds, imageElement) => {
          selectedIds[imageElement.id] = true;
          return selectedIds;
        },
        {},
      );

      api.addFiles(fileEntries);

      api.updateScene({
        elements: [...api.getSceneElementsIncludingDeleted(), ...imageElements],
        appState: {
          selectedElementIds,
        },
      });

      if (renderedPages.length > 1) {
        const firstPage = renderedPages[0].pageNumber;
        const lastPage = renderedPages[renderedPages.length - 1].pageNumber;

        api.setToast({
          message: `Inserted ${renderedPages.length} pages (${firstPage}-${lastPage}).`,
        });
      } else if (renderedPages[0].totalPages > 1) {
        api.setToast({
          message: `Inserted page ${renderedPages[0].pageNumber} of ${renderedPages[0].totalPages}.`,
        });
      }
    } catch {
      api.setToast({
        message:
          "Could not import PDF. Use a valid page selection like 1, 3-5, or all.",
      });
    } finally {
      setIsImportingPdf(false);
    }
  }, []);

  const handlePdfInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.currentTarget.files?.[0];
      event.currentTarget.value = "";

      if (!selectedFile) {
        return;
      }

      void insertPdfFile(selectedFile);
    },
    [insertPdfFile],
  );

  const handleExcalidrawApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      excalidrawApiRef.current = api;

      if (onChangeUnsubscribeRef.current) {
        onChangeUnsubscribeRef.current();
        onChangeUnsubscribeRef.current = null;
      }

      const initialWidth = clampPenWidth(
        api.getAppState().currentItemStrokeWidth,
      );
      applyPenWidth(initialWidth);

      onChangeUnsubscribeRef.current = api.onChange((_elements, appState) => {
        const nextWidth = clampPenWidth(appState.currentItemStrokeWidth);
        setPenWidth((previousWidth) => {
          if (Math.abs(previousWidth - nextWidth) < 0.001) {
            return previousWidth;
          }

          return nextWidth;
        });
      });
    },
    [applyPenWidth],
  );

  useEffect(() => {
    return () => {
      if (onChangeUnsubscribeRef.current) {
        onChangeUnsubscribeRef.current();
        onChangeUnsubscribeRef.current = null;
      }

      excalidrawApiRef.current = null;
    };
  }, []);

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
                  void handleToggleFullscreen();
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
