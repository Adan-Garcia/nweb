import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import type { Twig } from "@/lib/twig-model";

type BoardDeepLink = {
  isLoading: boolean;
  twigs: Twig[];
  openAdd: () => void;
  openEdit: (twig: Twig) => void;
};

/**
 * `?task=<id>` opens that task's editor and `?new=task` opens an empty one: how the command
 * palette hands a task over to the board. The parameter is cleared once it has been acted
 * on, so a reload or a Back does not open the dialog a second time.
 */
export function useBoardDeepLink({ isLoading, twigs, openAdd, openEdit }: BoardDeepLink) {
  const [params, setParams] = useSearchParams();
  const taskId = params.get("task");
  const isNew = params.get("new") === "task";
  // The editor's handlers are new on every render, so without this the effect would open
  // the dialog again on each render until the cleared parameter has come through.
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const request = taskId ?? (isNew ? "new" : null);

    if (!request) {
      // Cleared, so the same task asked for again later is a new request.
      handledRef.current = null;
      return;
    }

    if (isLoading || handledRef.current === request) {
      return;
    }

    handledRef.current = request;

    const twig = taskId ? twigs.find((candidate) => candidate.id === taskId) : undefined;

    if (twig) {
      openEdit(twig);
    } else if (isNew) {
      openAdd();
    }

    setParams({}, { replace: true });
  }, [isLoading, isNew, taskId, twigs, openAdd, openEdit, setParams]);
}
