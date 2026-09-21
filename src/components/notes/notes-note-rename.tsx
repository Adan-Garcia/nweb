import { useState } from "react";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type NotesNoteRenameProps = {
  feather: string;
  indent: string;
  onSubmit: (feather: string) => void;
  onCancel: () => void;
};

/** Renaming a note in place. The note keeps its id, so nothing that points at it moves. */
export function NotesNoteRename({ feather, indent, onSubmit, onCancel }: NotesNoteRenameProps) {
  const [draft, setDraft] = useState(feather);

  return (
    <form
      className="flex items-center gap-1 py-0.5"
      style={{ paddingLeft: indent }}
      onSubmit={(event) => {
        event.preventDefault();

        if (draft.trim().length) {
          onSubmit(draft.trim());
        }
      }}
    >
      <Input
        aria-label={`New name for ${feather}`}
        autoFocus
        value={draft}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
        }}
        className="h-7 text-xs"
      />
      <Button
        type="submit"
        size="icon-sm"
        variant="ghost"
        aria-label="Save the new name"
        disabled={!draft.trim().length}
      >
        <Check className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Keep the old name"
        onClick={onCancel}
      >
        <X className="size-3.5" />
      </Button>
    </form>
  );
}
