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

  const visible = events.slice(0, 2);

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect(date)}
      aria-pressed={isSelected}
      className={cn(
        "flex min-w-0 flex-col items-start justify-start gap-1 p-1.5 text-left transition-colors hover:bg-muted/50 sm:p-2",
        isCompact ? "min-h-16 sm:min-h-24" : "min-h-40",
        isCurrentMonth ? "bg-card" : "bg-muted/30 text-muted-foreground",
        isSelected && "bg-brand-soft hover:bg-brand-soft",
        isOver && "bg-brand-soft ring-2 ring-inset ring-primary/50",
      )}
    >
      <span
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-full text-caption font-medium",
          isToday && "bg-primary text-primary-foreground",
        )}
      >
        {date.getDate()}
      </span>

      <div className="flex w-full gap-1 sm:hidden" aria-hidden="true">
        {visible.map((event) => (
          <span
            key={event.id}
            className={cn(
              "size-1.5 rounded-full",
              branchLabelFor(snapshot, event.branchId).colorClass,
            )}
          />
        ))}
      </div>

      <div className="hidden w-full gap-0.5 sm:grid">
        {visible.map((event) => (
          <div
            key={event.id}
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-[0.7rem] leading-tight hover:bg-muted",
              event.status === "complete" && "text-muted-foreground line-through",
            )}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                branchLabelFor(snapshot, event.branchId).colorClass,
              )}
            />
            <span className="truncate">{event.title}</span>
          </div>
        ))}
        {events.length > 2 ? (
          <p className="px-1.5 text-[0.7rem] text-muted-foreground">+{events.length - 2} more</p>
        ) : null}
      </div>
    </button>
  );
}
