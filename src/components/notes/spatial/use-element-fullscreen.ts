import { type RefObject, useCallback, useEffect, useState } from "react";

/**
 * Fullscreen for one element, plus a toggle. Where the browser will not make an element
 * fullscreen (Safari on an iPhone has no such API, and on an iPad it can refuse), the
 * element covers the window instead: `isCovering` tells it to, and Escape or the same
 * toggle puts it back.
 */
export function useElementFullscreen(elementRef: RefObject<HTMLElement | null>) {
  const [isNative, setIsNative] = useState(false);
  const [isCovering, setIsCovering] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsNative(document.fullscreenElement === elementRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [elementRef]);

  useEffect(() => {
    if (!isCovering) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCovering(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isCovering]);

  const toggleFullscreen = useCallback(async () => {
    const element = elementRef.current;
    if (!element) {
      return;
    }
    if (isCovering) {
      setIsCovering(false);
      return;
    }

    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
        return;
      }

      // Checked rather than trusted: the DOM types promise it, Safari on an iPhone lacks it.
      if (typeof element.requestFullscreen !== "function") {
        setIsCovering(true);
        return;
      }
      await element.requestFullscreen();
    } catch {
      setIsCovering(document.fullscreenElement !== element);
    }
  }, [elementRef, isCovering]);

  return { isFullscreen: isNative || isCovering, isCovering, toggleFullscreen };
}
