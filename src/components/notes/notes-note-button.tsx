import { Clock3, FileText } from "lucide-react"

import { formatPath, formatUpdatedAt } from "@/components/notes/notes-tree"
import type { NotesDirectoryEntry } from "@/components/notes/types"
import { cn } from "@/lib/utils"

type NotesNoteButtonProps = {
  entry: NotesDirectoryEntry
  isActive: boolean
  isBusy: boolean
  onOpen: (documentId: string) => void
}

/** A saved note (feather) row in the file viewer. */
export function NotesNoteButton({ entry, isActive, isBusy, onOpen }: NotesNoteButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "grid w-full gap-1 rounded-md border border-border/70 bg-background/70 px-2 py-2 text-left transition-colors hover:bg-muted/60",
        isActive && "border-primary/60 bg-primary/5"
      )}
      style={{ paddingLeft: `${0.55 + 4 * 0.8}rem` }}
      onClick={() => {
        onOpen(entry.id)
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
      <span className="truncate text-[0.68rem] text-muted-foreground">{formatPath(entry)}</span>
      <span className="flex items-center gap-1 text-[0.68rem] text-muted-foreground">
        <Clock3 className="size-3" />
        Updated {formatUpdatedAt(entry.updatedAt)}
      </span>
    </button>
  )
}
