import { useState } from "react";
import { Clock3, FileText } from "lucide-react";

import { NotesNoteActions } from "@/components/notes/notes-note-actions";
import { NotesNoteRename } from "@/components/notes/notes-note-rename";
import { formatUpdatedAt } from "@/components/notes/notes-tree";
import type { NotesDirectoryEntry } from "@/components/notes/types";
import {
  displayLocation,
  formatLocationPath,
  type WorkspaceSnapshot,
} from "@/lib/hierarchy/workspace-tree";
import { cn } from "@/lib/utils";

type NotesNoteButtonProps = {
  snapshot: WorkspaceSnapshot;
  entry: NotesDirectoryEntry;
  isActive: boolean;
  isBusy: boolean;
  onOpen: (documentId: string) => void;
  onRename: (documentId: string, feather: string) => void;
  onDelete: (documentId: string) => void;
};

/** The indent that lines a note up under its nest. */
const NOTE_INDENT = `${0.55 + 4 * 0.8}rem`;

/**
 * A saved note (feather) row in the file viewer: open it, rename it in place, or delete
 * it. The actions sit beside the open control rather than inside it, because a button
 * inside a button is not a thing a browser will render.
 */
export function NotesNoteButton({
  snapshot,
  entry,
  isActive,
  isBusy,
  onOpen,
  onRename,
  onDelete,
}: NotesNoteButtonProps) {
  const [isRenaming, setIsRenaming] = useState(false);

  if (isRenaming) {
    return (
      <NotesNoteRename
        feather={entry.feather}
        indent={NOTE_INDENT}
        onSubmit={(feather) => {
          onRename(entry.id, feather);
          setIsRenaming(false);
        }}
        onCancel={() => {
          setIsRenaming(false);
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-1 rounded-md border border-border/70 bg-background/70 pr-1 transition-colors hover:bg-muted/60",
        isActive && "border-primary/60 bg-primary/5",
      )}
      style={{ paddingLeft: NOTE_INDENT }}
    >
      <button
        type="button"
        // Named explicitly: the row's text runs to a path and a timestamp, and "Open
        // Lecture Notes" is what this control actually does. It also keeps it apart from
        // the rename and delete controls beside it, which carry the same title.
        aria-label={`Open ${entry.feather}`}
        className="grid flex-1 gap-1 py-2 text-left"
        onClick={() => {
          onOpen(entry.id);
        }}
        disabled={isBusy}
      >
        <span className="flex items-center gap-2 text-xs font-medium">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{entry.feather}</span>
          <span className="ml-auto rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">
            {entry.createdMode}
          </span>
        </span>
        <span className="truncate text-[0.68rem] text-muted-foreground">
          {formatLocationPath(displayLocation(snapshot, entry))}
        </span>
        <span className="flex items-center gap-1 text-[0.68rem] text-muted-foreground">
          <Clock3 className="size-3" />
          Updated {formatUpdatedAt(entry.updatedAt)}
        </span>
      </button>

      <NotesNoteActions
        feather={entry.feather}
        isBusy={isBusy}
        onRename={() => {
          setIsRenaming(true);
        }}
        onDelete={() => {
          onDelete(entry.id);
        }}
      />
    </div>
  );
}
