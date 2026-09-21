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
import { EventOverlay } from "@/components/calendar/event-overlay";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useThemeMode } from "@/hooks/use-theme-mode";

export function BoardPage() {
  const { isDark, toggleTheme } = useThemeMode();
  const board = useBoard();
  const { editor } = board;

  // A small distance before a drag starts, so the buttons on a card still take a click.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <WorkspaceShell isDark={isDark} onToggleTheme={toggleTheme}>
      <div className="mx-auto max-w-8xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Board</h1>
            <p className="text-base text-muted-foreground">
              Every task, dated or not. Drag a card to reorder it or to change what it is.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={board.isLoading}
            onClick={() => {
              editor.openAdd();
            }}
          >
            <Plus className="size-4" />
            Add Task
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={board.handleDragStart}
          onDragEnd={(event) => {
            void board.handleDragEnd(event);
          }}
          onDragCancel={board.handleDragCancel}
        >
          <div className="grid gap-4 md:grid-cols-3">
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
      </div>

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
    </WorkspaceShell>
  );
}
