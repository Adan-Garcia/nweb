import { Clock3, Pencil, Trash2 } from "lucide-react";

import {
  branchLabelFor,
  type DatedTwig,
  formatShortDate,
} from "@/components/calendar/calendar-shared";
import { StatusSlider } from "@/components/calendar/status-slider";
import { Button } from "@/components/ui/button";
import { TWIG_KIND_LABELS, type TwigStatus } from "@/lib/twig-model";
import type { WorkspaceSnapshot } from "@/lib/workspace-tree";

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

  return (
    <div
      className={`rounded-lg border border-border p-3 transition-opacity duration-300 ${
        event.status === "complete" ? "opacity-60" : "opacity-90 hover:opacity-100"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2 flex-col">
        <div className="flex flex-row items-center min-w-full justify-between">
          <StatusSlider
            status={event.status}
            onChangeStatus={(nextStatus) => onSetStatus(event.id, nextStatus)}
            eventTitle={event.title}
          />

          <div>
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
        <div className="flex flex-row gap-2 items-center justify-center">
          <span className={`inline-block size-2.5 rounded-full ${branch.colorClass}`} />
          <p
            className={`truncate font-medium ${event.status === "complete" ? "line-through text-muted-foreground" : ""}`}
          >
            {event.title}
          </p>
        </div>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground flex flex-row justify-between">
        <p className="flex items-center gap-2">
          <Clock3 className="size-3.5" />
          {formatShortDate(event.dueDate)} at {event.dueTime}
        </p>

        <p className="flex items-center gap-2">
          {branch.name} &middot; {TWIG_KIND_LABELS[event.kind]}
        </p>
      </div>
    </div>
  );
}
