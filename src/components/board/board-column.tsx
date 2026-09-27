import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { BoardCard } from "@/components/board/board-card";
import type { WorkspaceSnapshot } from "@/lib/hierarchy/workspace-tree";
import { type BoardColumn as BoardColumnModel, columnId } from "@/lib/twigs/board";
import type { Twig } from "@/lib/twigs/twig-model";
import { cn } from "@/lib/utils";

type BoardColumnProps = {
  snapshot: WorkspaceSnapshot;
  column: BoardColumnModel;
  onEdit: (twig: Twig) => void;
  onDelete: (twig: Twig) => void;
};

/** One status column. The whole column is a drop target, so an empty one can be dropped into. */
export function BoardColumn({ snapshot, column, onEdit, onDelete }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(column.status) });
  const twigIds = column.twigs.map((twig) => twig.id);

  return (
    <section
      aria-label={`${column.label} column`}
      className={cn(
        "flex min-w-[17rem] snap-start flex-col gap-2 rounded-xl bg-muted/50 p-2 transition-colors md:min-w-0",
        isOver && "bg-brand-soft ring-1 ring-primary/40",
      )}
    >
      <h2 className="flex items-center justify-between gap-2 px-1.5 pt-1 text-heading">
        {column.label}
        <span className="rounded-full bg-background px-2 text-caption text-muted-foreground tabular-nums">
          {column.twigs.length}
        </span>
      </h2>
      <SortableContext items={twigIds} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          aria-label={column.label}
          className="grid min-h-24 content-start gap-2"
        >
          {column.twigs.map((twig) => (
            <BoardCard
              key={twig.id}
              snapshot={snapshot}
              twig={twig}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}

          {column.twigs.length ? null : (
            <li className="rounded-lg border border-dashed border-foreground/15 p-4 text-center text-caption text-muted-foreground">
              Nothing here yet.
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}
