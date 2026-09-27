import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";

import { branchLabelFor, formatShortDate } from "@/components/calendar/calendar-shared";
import { Button } from "@/components/ui/button";
import type { WorkspaceSnapshot } from "@/lib/hierarchy/workspace-tree";
import { type Twig, TWIG_KIND_LABELS } from "@/lib/twigs/twig-model";
import { cn } from "@/lib/utils";

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
        "group/card grid min-w-0 grid-cols-1 gap-1.5 rounded-lg border bg-card p-2.5 transition-colors hover:border-foreground/15",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Reorder ${twig.title}`}
          className="mt-0.5 shrink-0 cursor-grab rounded text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <p
          className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-medium"
          title={twig.title}
        >
          {twig.title}
        </p>

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

      <p className="flex min-w-0 flex-wrap items-center gap-1.5 break-words pl-6 text-caption text-muted-foreground">
        <span
          aria-hidden="true"
          className={cn("inline-block size-2 shrink-0 rounded-full", branch.colorClass)}
        />
        {branch.name} &middot; {TWIG_KIND_LABELS[twig.kind]}
        {twig.dueDate ? ` · ${formatShortDate(twig.dueDate)}` : " · No date"}
      </p>
    </li>
  );
}
