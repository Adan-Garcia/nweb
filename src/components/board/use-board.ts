import { useCallback, useMemo, useState } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";

import { useCalendarTwigs } from "@/components/calendar/use-calendar-twigs";
import { useTwigDeletion } from "@/components/calendar/use-twig-deletion";
import { useTwigEditor } from "@/components/calendar/use-twig-editor";
import { applyBoardDrop, buildBoardColumns, resolveBoardDrop } from "@/lib/twigs/board";
import { moveTwig } from "@/lib/twigs/twig-storage";

/**
 * The board: one column per status, cards dragged between and within them.
 *
 * A drop is applied to the columns in memory before it is written, so the card stays under
 * the cursor instead of snapping back for a frame while IndexedDB catches up.
 */
export function useBoard() {
  const { twigs, isLoading, snapshot, refreshTwigs, saveTwig, deleteTwig } = useCalendarTwigs();
  const [columns, setColumns] = useState(() => buildBoardColumns([]));
  const [activeId, setActiveId] = useState<string | null>(null);

  // Derived from the store, except while a drop is being written.
  const storedColumns = useMemo(() => buildBoardColumns(twigs), [twigs]);
  const [syncedTwigs, setSyncedTwigs] = useState(twigs);

  if (syncedTwigs !== twigs) {
    setSyncedTwigs(twigs);
    setColumns(storedColumns);
  }

  const editor = useTwigEditor({ snapshot, saveTwig });

  const activeTwig = useMemo(
    () => columns.flatMap((column) => column.twigs).find((twig) => twig.id === activeId) ?? null,
    [columns, activeId],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);

      const drop = resolveBoardDrop({
        columns,
        activeId: String(event.active.id),
        overId: event.over ? String(event.over.id) : null,
      });

      if (!drop) {
        return;
      }

      setColumns((current) => applyBoardDrop(current, drop));
      await moveTwig(drop);
      await refreshTwigs();
    },
    [columns, refreshTwigs],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const deletion = useTwigDeletion(deleteTwig);

  return {
    columns,
    isLoading,
    snapshot,
    activeTwig,
    editor,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    deletion,
  };
}
