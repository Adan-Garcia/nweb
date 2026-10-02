import { useEffect, useRef, useState } from "react";

import type { CanvasFiles } from "@/lib/canvas/canvas-files";

/**
 * Decoded images for the files a drawing uses, by file id. Each file is decoded once;
 * until it has loaded the renderer outlines where it goes.
 */
export function useCanvasImages(files: CanvasFiles): ReadonlyMap<string, CanvasImageSource> {
  const [loaded, setLoaded] = useState<ReadonlyMap<string, HTMLImageElement>>(new Map());
  const requestedRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const requested = requestedRef.current;
    for (const file of files.values()) {
      if (requested.has(file.id)) {
        continue;
      }
      requested.add(file.id);

      const image = new Image();
      image.onload = () => {
        if (mountedRef.current) {
          setLoaded((current) => new Map(current).set(file.id, image));
        }
      };
      image.src = file.url;
    }
  }, [files]);

  return loaded;
}
