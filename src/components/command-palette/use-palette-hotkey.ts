import { useEffect } from "react";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * ⌘K on a Mac and Ctrl+K elsewhere, from anywhere; "/" too, but only when it would not
 * have typed a slash into something.
 */
export function usePaletteHotkey(onOpen: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isChord = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      const isSlash =
        event.key === "/" && !event.metaKey && !event.ctrlKey && !isTyping(event.target);

      if (isChord || isSlash) {
        event.preventDefault();
        onOpen();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpen]);
}
