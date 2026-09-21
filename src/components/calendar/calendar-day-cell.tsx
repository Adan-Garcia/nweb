import { useDroppable } from "@dnd-kit/core";

import { branchLabelFor, type DatedTwig } from "@/components/calendar/calendar-shared";
import { dayId } from "@/lib/calendar-drop";
import { cn } from "@/lib/utils";
import type { WorkspaceSnapshot } from "@/lib/workspace-tree";

type CalendarDayCellProps = {
  snapshot: WorkspaceSnapshot;
  date: Date;
  dateKey: string;
  events: DatedTwig[];
  isToday: boolean;
  isCurrentMonth: boolean;
  isSelected: boolean;
  isCompact: boolean;
  onSelect: (date: Date) => void;
};

/** One day in the grid. Also a drop target, so a task can be dragged onto another date. */
export function CalendarDayCell({
  snapshot,
  date,
  dateKey,
  events,
  isToday,
  isCurrentMonth,
  isSelected,
  isCompact,
  onSelect,
}: CalendarDayCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dayId(dateKey) });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect(date)}
      className={cn(
        "flex flex-col items-start justify-start rounded-lg border p-2 text-left opacity-90 transition-all duration-300 hover:opacity-100",
        isCompact ? "min-h-24" : "h-full",
        isCurrentMonth ? "bg-card" : "bg-muted/40 text-muted-foreground",
        isSelected
          ? "border-primary ring-1 ring-primary/30"
          : isToday
            ? "border-primary"
            : "border-border",
        isOver && "border-primary ring-2 ring-primary/40",
      )}
    >
      <div className="mb-1 flex w-full items-start justify-start">
        <span
          className={cn(
            "text-sm font-semibold",
            isToday &&
              "inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground",
          )}
        >
          {date.getDate()}
        </span>
      </div>

      <div className="w-full space-y-1">
        {events.slice(0, 2).map((event) => (
          <div
            key={event.id}
            className={cn(
              "truncate rounded-md bg-muted px-2 py-1 text-[11px] transition-opacity duration-300",
              event.status === "complete" ? "opacity-50" : "opacity-100",
            )}
          >
            <span
              className={cn(
                "mr-1 inline-block size-2 rounded-full",
                branchLabelFor(snapshot, event.branchId).colorClass,
              )}
            />
            {event.title}
          </div>
        ))}
        {events.length > 2 ? (
          <p className="text-[11px] text-muted-foreground">+{events.length - 2} more</p>
        ) : null}
      </div>
    </button>
  );
}
