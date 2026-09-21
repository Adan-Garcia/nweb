import { useCallback, useState } from "react";

import {
  type NotesNavigationMode,
  readNotesNavigationMode,
  writeNotesNavigationMode,
} from "@/lib/notes-navigation";

/**
 * Which way the notes page is navigated, and remembering the answer.
 *
 * The stored value is read once, on the first render, so the page paints the layout the
 * user last chose rather than the default and then the other one.
 */
export function useNotesNavigation() {
  const [navigationMode, setNavigationMode] =
    useState<NotesNavigationMode>(readNotesNavigationMode);

  const chooseNavigation = useCallback((mode: NotesNavigationMode) => {
    setNavigationMode(mode);
    writeNotesNavigationMode(mode);
  }, []);

  return { navigationMode, chooseNavigation };
}
