import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { BoardCard } from "@/components/board/board-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type BoardColumn as BoardColumnModel, columnId } from "@/lib/board";
import type { Twig } from "@/lib/twig-model";
import { cn } from "@/lib/utils";
import type { WorkspaceSnapshot } from "@/lib/workspace-tree";

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
    <Card className={cn("min-w-0", isOver && "border-primary/60")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          {column.label}
          <span className="rounded-full border border-border px-2 text-xs text-muted-foreground">
            {column.twigs.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
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
              <li className="rounded-lg border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
                Nothing here yet.
              </li>
            )}
          </ul>
        </SortableContext>
      </CardContent>
    </Card>
  );
}
