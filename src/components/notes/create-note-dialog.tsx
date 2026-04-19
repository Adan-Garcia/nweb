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

import type { NotesDocumentMode } from "@/components/notes/types";

type NotesCreateNoteDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedLocationSummary: string;
  newNoteMode: NotesDocumentMode;
  onModeChange: (mode: NotesDocumentMode) => void;
  onCreate: () => void;
  isCreatingNote: boolean;
  isStorageReady: boolean;
  isHydratingDocument: boolean;
};

export function NotesCreateNoteDialog({
  isOpen,
  onOpenChange,
  selectedLocationSummary,
  newNoteMode,
  onModeChange,
  onCreate,
  isCreatingNote,
  isStorageReady,
  isHydratingDocument,
}: NotesCreateNoteDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Note</DialogTitle>
          <DialogDescription>
            Pick the note type. The editor will switch to the selected mode as
            soon as the note opens.
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
          </div>
        </div>

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" />}
            disabled={isCreatingNote}
          >
            Cancel
          </DialogClose>
          <Button
            onClick={() => {
              onCreate();
            }}
            disabled={!isStorageReady || isHydratingDocument || isCreatingNote}
          >
            {isCreatingNote ? "Creating..." : "Create and Open Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
