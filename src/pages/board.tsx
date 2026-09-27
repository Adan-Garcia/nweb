import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";

import { BoardColumn } from "@/components/board/board-column";
import { useBoard } from "@/components/board/use-board";
import { useBoardDeepLink } from "@/components/board/use-board-deep-link";
import { EventOverlay } from "@/components/calendar/event-overlay";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export function BoardPage() {
  const board = useBoard();
  const { editor } = board;

  useBoardDeepLink({
    isLoading: board.isLoading,
    twigs: board.columns.flatMap((column) => column.twigs),
    openAdd: editor.openAdd,
    openEdit: editor.openEdit,
  });

  // A small distance before a drag starts, so the buttons on a card still take a click.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <>
      <PageContainer width="wide">
        <PageHeader
          title="Board"
          description="Every task, dated or not. Drag a card to reorder it or to change what it is."
          actions={
            <Button
              disabled={board.isLoading}
              onClick={() => {
                editor.openAdd();
              }}
            >
              <Plus className="size-4" />
              Add Task
            </Button>
          }
        />

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={board.handleDragStart}
          onDragEnd={(event) => {
            void board.handleDragEnd(event);
          }}
          onDragCancel={board.handleDragCancel}
        >
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
            {board.columns.map((column) => (
              <BoardColumn
                key={column.status}
                snapshot={board.snapshot}
                column={column}
                onEdit={editor.openEdit}
                onDelete={(twig) => {
                  void board.removeTwig(twig);
                }}
              />
            ))}
          </div>
        </DndContext>
      </PageContainer>

      <EventOverlay
        isOpen={editor.isOpen}
        editingTwigId={editor.editingTwigId}
        register={editor.form.register}
        handleSubmit={editor.form.handleSubmit}
        errors={editor.form.formState.errors}
        branchOptions={editor.branchOptions}
        onSubmit={(values) => {
          void editor.submit(values);
        }}
        onClose={editor.close}
      />
    </>
  );
}
