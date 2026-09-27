import { useEffect, useState } from "react";

import { listNotesDirectoryEntries } from "@/lib/notes-directory-storage";
import { listTwigs } from "@/lib/twig-storage";
import { loadWorkspaceSnapshot } from "@/lib/workspace-storage";

import { noteEntries, type PaletteEntry, taskEntries } from "./palette-entries";

type PaletteData = { notes: PaletteEntry[]; tasks: PaletteEntry[] };

const EMPTY: PaletteData = { notes: [], tasks: [] };

/**
 * The notes and tasks to search, read each time the palette opens. Read then rather than
 * held, because a note renamed a minute ago should be findable under its new name.
 */
export function usePaletteData(isOpen: boolean): PaletteData {
  const [data, setData] = useState<PaletteData>(EMPTY);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isCurrent = true;

    void Promise.all([loadWorkspaceSnapshot(), listNotesDirectoryEntries(), listTwigs()])
      .then(([snapshot, notes, twigs]) => {
        if (isCurrent) {
          setData({ notes: noteEntries(snapshot, notes), tasks: taskEntries(snapshot, twigs) });
        }
      })
      // A read that fails leaves pages and actions, which are most of what the palette is for.
      .catch(() => undefined);

    return () => {
      isCurrent = false;
    };
  }, [isOpen]);

  return data;
}
