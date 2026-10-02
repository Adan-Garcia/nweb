import type { NotesDocumentMode } from "@/components/notes/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SceneLayout } from "@/lib/canvas/scene-model";

type NotesCreateNoteDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedLocationSummary: string;
  title: string;
  onTitleChange: (title: string) => void;
  newNoteMode: NotesDocumentMode;
  onModeChange: (mode: NotesDocumentMode) => void;
  newNoteLayout: SceneLayout;
  onLayoutChange: (layout: SceneLayout) => void;
  onCreate: () => void;
  isCreatingNote: boolean;
  isStorageReady: boolean;
  isHydratingDocument: boolean;
};

export function NotesCreateNoteDialog({
  isOpen,
  onOpenChange,
  selectedLocationSummary,
  title,
  onTitleChange,
  newNoteMode,
  onModeChange,
  newNoteLayout,
  onLayoutChange,
  onCreate,
  isCreatingNote,
  isStorageReady,
  isHydratingDocument,
}: NotesCreateNoteDialogProps) {
  const layoutChoice = (layout: SceneLayout, label: string) => (
    <Button
      variant={newNoteLayout === layout ? "secondary" : "ghost"}
      size="sm"
      aria-pressed={newNoteLayout === layout}
      onClick={() => onLayoutChange(layout)}
    >
      {label}
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Note</DialogTitle>
          <DialogDescription>
            Pick the note type. The editor will switch to the selected mode as soon as the note
            opens.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Selected Path
            </p>
            <p className="mt-1 rounded-md border bg-muted/40 px-2 py-1 text-sm">
              {selectedLocationSummary}
            </p>
          </div>

          <div className="grid gap-1">
            <Label htmlFor="new-note-title">Note Name</Label>
            <Input
              id="new-note-title"
              value={title}
              onChange={(event) => {
                onTitleChange(event.currentTarget.value);
              }}
              placeholder="Exam review"
            />
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Note Type
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                variant={newNoteMode === "linear" ? "default" : "outline"}
                onClick={() => {
                  onModeChange("linear");
                }}
                aria-pressed={newNoteMode === "linear"}
              >
                Linear Note
              </Button>
              <Button
                variant={newNoteMode === "spatial" ? "default" : "outline"}
                onClick={() => {
                  onModeChange("spatial");
                }}
                aria-pressed={newNoteMode === "spatial"}
              >
                Spatial Note
              </Button>
            </div>
            {newNoteMode === "spatial" ? (
              <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Canvas">
                {layoutChoice("infinite", "Infinite canvas")}
                {layoutChoice("paged", "Pages (Letter or A4)")}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />} disabled={isCreatingNote}>
            Cancel
          </DialogClose>
          <Button
            onClick={() => {
              onCreate();
            }}
            disabled={
              !isStorageReady || isHydratingDocument || isCreatingNote || !title.trim().length
            }
          >
            {isCreatingNote ? "Creating..." : "Create and Open Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
