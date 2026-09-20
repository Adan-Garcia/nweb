import { type ChangeEvent, type RefObject, useCallback, useRef, useState } from "react";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { renderPdfPagesToPng } from "@/components/notes/spatial-notes-pdf";
import { describePdfInsert, layoutPdfPages } from "@/components/notes/spatial-notes-pdf-layout";

/** Picking a PDF and inserting its pages into the canvas as images. */
export function usePdfImport(excalidrawApiRef: RefObject<ExcalidrawImperativeAPI | null>) {
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const [isImportingPdf, setIsImportingPdf] = useState(false);

  const openPdfPicker = useCallback(() => {
    pdfInputRef.current?.click();
  }, []);

  const insertPdfFile = useCallback(
    async (file: File) => {
      const api = excalidrawApiRef.current;
      if (!api) {
        return;
      }

      const isLikelyPdf =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

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

        const { fileEntries, imageSkeletons } = layoutPdfPages({
          pages: renderedPages,
          viewport: api.getAppState(),
          created: Date.now(),
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

        const message = describePdfInsert(renderedPages);
        if (message) {
          api.setToast({ message });
        }
      } catch {
        api.setToast({
          message: "Could not import PDF. Use a valid page selection like 1, 3-5, or all.",
        });
      } finally {
        setIsImportingPdf(false);
      }
    },
    [excalidrawApiRef],
  );

  const handlePdfInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.currentTarget.files?.[0];
      event.currentTarget.value = "";

      if (!selectedFile) {
        return;
      }

      void insertPdfFile(selectedFile);
    },
    [insertPdfFile],
  );

  return { pdfInputRef, isImportingPdf, openPdfPicker, handlePdfInputChange };
}
