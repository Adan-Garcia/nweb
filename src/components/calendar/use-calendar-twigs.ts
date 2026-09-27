import { useCallback, useEffect, useState } from "react";

import type { TwigFormValues } from "@/components/calendar/calendar-shared";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { isLockedError } from "@/lib/crypto/cipher";
import { ensureDefaultWorkspace } from "@/lib/hierarchy/workspace-storage";
import type { Twig, TwigStatus } from "@/lib/twigs/twig-model";
import { createTwigSeries, softDeleteTwigSeries } from "@/lib/twigs/twig-series";
import { listTwigs, softDeleteTwig, updateTwig } from "@/lib/twigs/twig-storage";

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
      } catch (error) {
        if (!isLockedError(error)) {
          throw error;
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
        // A task that does not repeat is a series of one.
        await createTwigSeries(
          { ...changes, dueDate: values.date },
          values.repeat,
          values.repeatUntil,
        );
      }

      await refreshTwigs();

      return changes;
    },
    [refreshTwigs],
  );

  const rescheduleTwig = useCallback(
    async (twigId: string, dueDate: string) => {
      await updateTwig(twigId, { dueDate });
      await refreshTwigs();
    },
    [refreshTwigs],
  );

  const deleteTwig = useCallback(
    async (twigToDelete: Twig) => {
      // A repeating task asks about the whole series first; declining that still offers to
      // delete the one occurrence, which is the more common wish.
      if (
        twigToDelete.seriesId &&
        window.confirm(`Delete every occurrence of "${twigToDelete.title}"?`)
      ) {
        await softDeleteTwigSeries(twigToDelete.seriesId);
      } else if (window.confirm(`Delete "${twigToDelete.title}"?`)) {
        await softDeleteTwig(twigToDelete.id);
      } else {
        return;
      }

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
    rescheduleTwig,
  };
}
