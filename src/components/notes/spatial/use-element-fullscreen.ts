import { type RefObject, useCallback, useEffect, useState } from "react";

/** Fullscreen state for one element, plus a toggle. */
export function useElementFullscreen(elementRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === elementRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [elementRef]);

  const toggleFullscreen = useCallback(async () => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
        return;
      }

      await element.requestFullscreen();
    } catch {
      return;
    }
  }, [elementRef]);

  return { isFullscreen, toggleFullscreen };
}
