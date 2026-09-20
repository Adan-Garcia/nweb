import { useCallback, useEffect, useState, type RefObject } from "react";
import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";

import { isImageFile } from "@/components/notes/scene-utils";
import type { NotesMode } from "@/components/notes/types";
import type { MediaWorkerClient } from "@/lib/media-worker-client";

type HandleSpatialPaste = NonNullable<ExcalidrawProps["onPaste"]>;

type UseNotesImageIngestOptions = {
  mediaWorker: MediaWorkerClient;
  spatialHostRef: RefObject<HTMLDivElement | null>;
  mode: NotesMode;
};

/**
 * Optimizes images pasted into or dropped onto the spatial editor and counts
 * how many assets have been optimized this session.
 */
export function useNotesImageIngest({
  mediaWorker,
  spatialHostRef,
  mode,
}: UseNotesImageIngestOptions) {
  const [optimizedAssetCount, setOptimizedAssetCount] = useState(0);

  const processIncomingImageFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter(isImageFile);
      if (!imageFiles.length) {
        return;
      }

      const optimizedFiles = await Promise.all(
        imageFiles.map(async (file) => {
          return await mediaWorker.optimizeImageFile(file);
        }),
      );

      setOptimizedAssetCount(
        (currentCount) => currentCount + optimizedFiles.length,
      );
    },
    [mediaWorker],
  );

  const handleSpatialPaste = useCallback<HandleSpatialPaste>(
    (_clipboardData, event) => {
      if (!event?.clipboardData) {
        return false;
      }

      const files = Array.from(event.clipboardData.files);
      if (files.length) {
        void processIncomingImageFiles(files);
      }

      return false;
    },
    [processIncomingImageFiles],
  );

  useEffect(() => {
    if (mode !== "spatial") {
      return;
    }

    const hostElement = spatialHostRef.current;
    if (!hostElement) {
      return;
    }

    const handleDrop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) {
        void processIncomingImageFiles(files);
      }
    };

    hostElement.addEventListener("drop", handleDrop, true);

    return () => {
      hostElement.removeEventListener("drop", handleDrop, true);
    };
  }, [mode, processIncomingImageFiles, spatialHostRef]);

  return { optimizedAssetCount, handleSpatialPaste };
}
