import { useCallback, useEffect, useState } from "react";

import type { TwigFormValues } from "@/components/calendar/calendar-shared";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { isLockedError } from "@/lib/crypto/cipher";
import { ensureDefaultWorkspace } from "@/lib/hierarchy/workspace-storage";
import type { Twig, TwigStatus } from "@/lib/twigs/twig-model";
import {
  createTwigSeries,
  dayShiftBetween,
  repeatTwig,
  type SeriesScope,
  softDeleteTwigSeries,
  updateTwigSeries,
} from "@/lib/twigs/twig-series";
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

  /**
   * Updates `editingTwig` — and as much of its series as the form's scope asks for — or
   * creates a new task when it is null.
   */
  const saveTwig = useCallback(
    async (values: TwigFormValues, editingTwig: Twig | null) => {
      const changes = {
        title: values.title.trim(),
        dueDate: values.date,
        dueTime: values.time.trim(),
        branchId: values.branchId,
        kind: values.kind,
        status: values.status,
      };

      if (editingTwig === null) {
        // A task that does not repeat is a series of one.
        await createTwigSeries(
          { ...changes, dueDate: values.date },
          values.repeat,
          values.repeatUntil,
        );
      } else if (editingTwig.seriesId && values.scope !== "one") {
        const { title, dueTime, branchId, kind } = changes;

        await updateTwigSeries(
          editingTwig.seriesId,
          values.scope === "following" ? editingTwig.dueDate : null,
          { title, dueTime, branchId, kind },
          dayShiftBetween(editingTwig.dueDate, values.date),
        );
        // Done or not is each occurrence's own, so only the one being edited takes it.
        await updateTwig(editingTwig.id, { status: changes.status });
      } else {
        const updated = await updateTwig(editingTwig.id, changes);

        if (updated && !editingTwig.seriesId) {
          await repeatTwig(updated, values.repeat, values.repeatUntil);
        }
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

  /** Deletes a task, or as much of its series as `scope` reaches. Asking first is the UI's. */
  const deleteTwig = useCallback(
    async (twigToDelete: Twig, scope: SeriesScope = "one") => {
      if (twigToDelete.seriesId && scope !== "one") {
        await softDeleteTwigSeries(
          twigToDelete.seriesId,
          scope === "following" ? twigToDelete.dueDate : null,
        );
      } else {
        await softDeleteTwig(twigToDelete.id);
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
