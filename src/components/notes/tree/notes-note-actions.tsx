import { useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type NotesNoteActionsProps = {
  feather: string;
  isBusy: boolean;
  onRename: () => void;
  onDelete: () => void;
};

/**
 * Rename and delete for one note in the tree, with the delete behind a confirm step: it
 * takes the text, the drawing and the images with it, and nothing here can undo that.
 */
export function NotesNoteActions({ feather, isBusy, onRename, onDelete }: NotesNoteActionsProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (isConfirming) {
    return (
      <div className="flex shrink-0 items-center gap-0.5 py-1.5">
        <Button
          type="button"
          size="icon-sm"
          variant="destructive"
          aria-label={`Delete ${feather} for good`}
          disabled={isBusy}
          onClick={() => {
            setIsConfirming(false);
            onDelete();
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Keep ${feather}`}
          onClick={() => {
            setIsConfirming(false);
          }}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5 py-1.5">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Rename ${feather}`}
        disabled={isBusy}
        onClick={onRename}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Delete ${feather}`}
        disabled={isBusy}
        onClick={() => {
          setIsConfirming(true);
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
