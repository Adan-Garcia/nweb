import { useState } from "react";
import { Trash2 } from "lucide-react";

import type { NotesDirectoryEntry } from "@/components/notes/types";
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
import {
  displayLocation,
  formatLocationPath,
  type WorkspaceSnapshot,
} from "@/lib/hierarchy/workspace-tree";

type NotesDeleteNoteControlProps = {
  snapshot: WorkspaceSnapshot;
  activeEntry: NotesDirectoryEntry | null;
  isDisabled: boolean;
  onDelete: (documentId: string) => void;
};

/** Deletes the note that is open, behind a confirmation, because nothing here can undo it. */
export function NotesDeleteNoteControl({
  snapshot,
  activeEntry,
  isDisabled,
  onDelete,
}: NotesDeleteNoteControlProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setIsConfirmOpen(true);
        }}
        disabled={isDisabled || !activeEntry}
      >
        <Trash2 />
        Delete Note
      </Button>

      <Dialog open={isConfirmOpen && activeEntry !== null} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this note?</DialogTitle>
            <DialogDescription>
              Its text, drawing and images are removed from this browser. There is no undo and no
              copy on a server, so an exported backup is the only way to get it back.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Note
            </p>
            <p className="mt-1 rounded-md border bg-muted/40 px-2 py-1 text-sm">
              {activeEntry ? formatLocationPath(displayLocation(snapshot, activeEntry)) : ""}
            </p>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Keep Note</DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setIsConfirmOpen(false);

                if (activeEntry) {
                  onDelete(activeEntry.id);
                }
              }}
            >
              Delete Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
