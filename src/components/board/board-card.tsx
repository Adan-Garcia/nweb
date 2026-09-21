import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";

import { branchLabelFor, formatShortDate } from "@/components/calendar/calendar-shared";
import { Button } from "@/components/ui/button";
import { type Twig, TWIG_KIND_LABELS } from "@/lib/twig-model";
import { cn } from "@/lib/utils";
import type { WorkspaceSnapshot } from "@/lib/workspace-tree";

type BoardCardProps = {
  snapshot: WorkspaceSnapshot;
  twig: Twig;
  onEdit: (twig: Twig) => void;
  onDelete: (twig: Twig) => void;
};

/**
 * One task on the board. Only the grip starts a drag, so the edit and delete buttons stay
 * clickable and the card can still be picked up from the keyboard.
 */
export function BoardCard({ snapshot, twig, onEdit, onDelete }: BoardCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: twig.id });
  const branch = branchLabelFor(snapshot, twig.branchId);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "grid gap-1 rounded-lg border border-border/70 bg-card p-2.5",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Reorder ${twig.title}`}
          className="mt-0.5 cursor-grab rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <p className="min-w-0 flex-1 truncate text-sm font-medium">{twig.title}</p>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${twig.title}`}
          onClick={() => onEdit(twig)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${twig.title}`}
          onClick={() => onDelete(twig)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <p className="flex items-center gap-1.5 pl-6 text-[0.68rem] text-muted-foreground">
        <span
          aria-hidden="true"
          className={cn("inline-block size-2 rounded-full", branch.colorClass)}
        />
        {branch.name} &middot; {TWIG_KIND_LABELS[twig.kind]}
        {twig.dueDate ? ` · ${formatShortDate(twig.dueDate)}` : " · No date"}
      </p>
    </li>
  );
}
