import type { ReactNode } from "react"
import { ChevronRight, FolderOpen } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

type NotesTreeGroupProps = {
  groupKey: string
  label: string
  depth: number
  itemCount: number
  isExpanded: boolean
  onExpandedChange: (groupKey: string, isExpanded: boolean) => void
  role?: "listitem"
  children: ReactNode
}

/** One collapsible level of the notes tree (a wing, flight, branch or nest). */
export function NotesTreeGroup({
  groupKey,
  label,
  depth,
  itemCount,
  isExpanded,
  onExpandedChange,
  role,
  children,
}: NotesTreeGroupProps) {
  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={(nextOpen) => {
        onExpandedChange(groupKey, nextOpen)
      }}
      className="space-y-1"
      role={role}
    >
      <CollapsibleTrigger
        className="flex min-h-8 w-full items-center gap-2 rounded-md border border-border/70 bg-background/70 pr-2 text-left text-xs font-medium transition-colors hover:bg-muted/60"
        style={{ paddingLeft: `${0.55 + depth * 0.8}rem` }}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            isExpanded && "rotate-90"
          )}
        />
        <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
        <span className="ml-auto text-[0.66rem] text-muted-foreground">{itemCount}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1">{children}</CollapsibleContent>
    </Collapsible>
  )
}
