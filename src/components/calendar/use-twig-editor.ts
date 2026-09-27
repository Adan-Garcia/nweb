import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {
  formatDateKey,
  twigFormSchema,
  type TwigFormValues,
} from "@/components/calendar/calendar-shared";
import {
  branchPath,
  canFileUnder,
  isReadOnlyEntity,
  type WorkspaceSnapshot,
} from "@/lib/hierarchy/workspace-tree";
import type { Twig } from "@/lib/twigs/twig-model";

const DEFAULT_EVENT_TIME = "9:00 AM";

export type BranchOption = {
  id: string;
  name: string;
  label: string;
};

type UseTwigEditorOptions = {
  snapshot: WorkspaceSnapshot;
  saveTwig: (values: TwigFormValues, editingTwigId: string | null) => Promise<unknown>;
  /** Runs after a successful save, with the date that was saved. */
  onSaved?: (dateKey: string) => void;
};

/**
 * The add/edit task form, shared by the calendar and the board so both write a twig the
 * same way and neither grows its own copy of the schema.
 */
export function useTwigEditor({ snapshot, saveTwig, onSaved }: UseTwigEditorOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingTwigId, setEditingTwigId] = useState<string | null>(null);

  /** Every branch in the workspace, labelled with the flight it belongs to. */
  const branchOptions = useMemo<BranchOption[]>(
    () =>
      snapshot.branches
        // Only courses a task can be filed under: not a name on somebody's path, and not a
        // course shared to read.
        .filter((branch) => canFileUnder(snapshot, branch.id))
        .map((branch) => {
          const path = branchPath(snapshot, branch.id);

          return {
            id: branch.id,
            name: branch.name,
            // A shared course has no term to qualify it, and its own name is the whole of
            // what can be said about it.
            label: path?.flight ? `${path.flight.name} / ${branch.name}` : branch.name,
          };
        })
        .sort((left, right) => left.label.localeCompare(right.label)),
    [snapshot],
  );

  const form = useForm<TwigFormValues>({
    resolver: zodResolver(twigFormSchema),
    defaultValues: {
      title: "",
      date: formatDateKey(new Date()),
      time: DEFAULT_EVENT_TIME,
      branchId: "",
      kind: "homework",
      status: "incomplete",
    },
  });

  const close = () => {
    setIsOpen(false);
    setEditingTwigId(null);
  };

  const openAdd = (defaultDate?: string | null) => {
    setEditingTwigId(null);
    form.reset({
      title: "",
      date: defaultDate ?? formatDateKey(new Date()),
      time: DEFAULT_EVENT_TIME,
      branchId: branchOptions[0]?.id ?? "",
      kind: "homework",
      status: "incomplete",
    });
    setIsOpen(true);
  };

  const openEdit = (twigToEdit: Twig) => {
    // A task in a course shared to read cannot be saved, so the form is not offered for it.
    if (isReadOnlyEntity(snapshot, twigToEdit.branchId)) {
      return;
    }

    setEditingTwigId(twigToEdit.id);
    form.reset({
      title: twigToEdit.title,
      date: twigToEdit.dueDate ?? formatDateKey(new Date()),
      time: twigToEdit.dueTime || DEFAULT_EVENT_TIME,
      branchId: twigToEdit.branchId,
      kind: twigToEdit.kind,
      status: twigToEdit.status,
    });
    setIsOpen(true);
  };

  const submit = async (values: TwigFormValues) => {
    await saveTwig(values, editingTwigId);
    onSaved?.(values.date);
    close();
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setEditingTwigId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return { isOpen, editingTwigId, form, branchOptions, openAdd, openEdit, submit, close };
}
