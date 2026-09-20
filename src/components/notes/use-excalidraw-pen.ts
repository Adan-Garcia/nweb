import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  DEFAULT_PEN_WIDTH,
  clampPenWidth,
} from "@/components/notes/spatial-notes-editor-utils";

/**
 * Holds the Excalidraw API handle and keeps the toolbar's pen width in sync
 * with the canvas in both directions.
 */
export function useExcalidrawPen() {
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const onChangeUnsubscribeRef = useRef<(() => void) | null>(null);
  const [penWidth, setPenWidth] = useState(DEFAULT_PEN_WIDTH);

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

  return { excalidrawApiRef, penWidth, applyPenWidth, handleExcalidrawApi };
}
