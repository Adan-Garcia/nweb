import { useCallback, useEffect, useState } from "react";

import type { TwigFormValues } from "@/components/calendar/calendar-shared";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import type { Twig, TwigStatus } from "@/lib/twig-model";
import { createTwig, listTwigs, softDeleteTwig, updateTwig } from "@/lib/twig-storage";
import { ensureDefaultWorkspace } from "@/lib/workspace-storage";

/**
 * The tasks the calendar draws, and the operations on them. Twigs live in IndexedDB
 * alongside the notes rather than in `localStorage`, so the calendar, the board and the
 * dashboard all read one list.
 */
export function useCalendarTwigs() {
  const [twigs, setTwigs] = useState<Twig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { snapshot, setSnapshot, refreshSnapshot } = useWorkspaceSnapshot();

  const refreshTwigs = useCallback(async () => {
    const next = await listTwigs();
    setTwigs(next);

    return next;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        // A task has to belong to a branch, so the form needs at least one to offer. On a
        // first run there is none until the notes page has been opened.
        const [nextTwigs, { snapshot: nextSnapshot }] = await Promise.all([
          listTwigs(),
          ensureDefaultWorkspace(),
        ]);

        if (isMounted) {
          setTwigs(nextTwigs);
          setSnapshot(nextSnapshot);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [setSnapshot]);

  const setTwigStatus = useCallback(
    async (twigId: string, status: TwigStatus) => {
      await updateTwig(twigId, { status });
      await refreshTwigs();
    },
    [refreshTwigs],
  );

  /** Updates the twig `editingTwigId`, or creates one when it is null. */
  const saveTwig = useCallback(
    async (values: TwigFormValues, editingTwigId: string | null) => {
      const changes = {
        title: values.title.trim(),
        dueDate: values.date,
        dueTime: values.time.trim(),
        branchId: values.branchId,
        kind: values.kind,
        status: values.status,
      };

      if (editingTwigId !== null) {
        await updateTwig(editingTwigId, changes);
      } else {
        await createTwig({ ...changes, title: changes.title });
      }

      await refreshTwigs();

      return changes;
    },
    [refreshTwigs],
  );

  const deleteTwig = useCallback(
    async (twigToDelete: Twig) => {
      if (!window.confirm(`Delete "${twigToDelete.title}"?`)) {
        return;
      }

      await softDeleteTwig(twigToDelete.id);
      await refreshTwigs();
    },
    [refreshTwigs],
  );

  return {
    twigs,
    isLoading,
    snapshot,
    refreshTwigs,
    refreshSnapshot,
    setTwigStatus,
    saveTwig,
    deleteTwig,
  };
}
