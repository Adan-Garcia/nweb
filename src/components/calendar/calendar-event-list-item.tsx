import { useDraggable } from "@dnd-kit/core";
import { Clock3, GripVertical, Pencil, Trash2 } from "lucide-react";

import {
  branchLabelFor,
  type DatedTwig,
  formatShortDate,
} from "@/components/calendar/calendar-shared";
import { StatusSlider } from "@/components/calendar/status-slider";
import { Button } from "@/components/ui/button";
import type { WorkspaceSnapshot } from "@/lib/hierarchy/workspace-tree";
import { TWIG_KIND_LABELS, type TwigStatus } from "@/lib/twigs/twig-model";
import { cn } from "@/lib/utils";

type CalendarEventListItemProps = {
  snapshot: WorkspaceSnapshot;
  event: DatedTwig;
  onEdit: (event: DatedTwig) => void;
  onDelete: (event: DatedTwig) => void;
  onSetStatus: (twigId: string, nextStatus: TwigStatus) => void;
};

/** One event in the list: status slider, edit/delete, title, date and class. */
export function CalendarEventListItem({
  snapshot,
  event,
  onEdit,
  onDelete,
  onSetStatus,
}: CalendarEventListItemProps) {
  const branch = branchLabelFor(snapshot, event.branchId);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: event.id,
  });

  const isComplete = event.status === "complete";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/event grid min-w-0 grid-cols-1 gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-foreground/15",
        isComplete && "opacity-60",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <StatusSlider
          status={event.status}
          onChangeStatus={(nextStatus) => onSetStatus(event.id, nextStatus)}
          eventTitle={event.title}
        />

        <div className="flex shrink-0 items-center text-muted-foreground">
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`Move ${event.title} to another day`}
            className="cursor-grab rounded-md p-1.5 hover:bg-muted hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(event)}
            aria-label={`Edit ${event.title}`}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(event)}
            aria-label={`Delete ${event.title}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <p
        title={event.title}
        className={cn(
          "line-clamp-2 break-words font-medium",
          isComplete && "text-muted-foreground line-through",
        )}
      >
        {event.title}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3.5" />
          {formatShortDate(event.dueDate)}
          {event.dueTime ? ` at ${event.dueTime}` : null}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span className={cn("inline-block size-2 shrink-0 rounded-full", branch.colorClass)} />
          <span className="min-w-0 break-words">
            {branch.name} &middot; {TWIG_KIND_LABELS[event.kind]}
          </span>
        </span>
      </div>
    </div>
  );
}
