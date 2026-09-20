import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { NotesLocationForm } from "@/components/notes/notes-location-form"
import { NotesTreeView } from "@/components/notes/notes-tree-view"
import { formatPath } from "@/components/notes/notes-tree"
import type {
  NotesDirectoryEntry,
  NotesDocumentMode,
  NotesHierarchyLocation,
} from "@/components/notes/types"

type NotesFileViewerProps = {
  entries: NotesDirectoryEntry[]
  activeDocumentId: string | null
  activeCreatedMode: NotesDocumentMode
  activeLocation: NotesHierarchyLocation
  isStorageReady: boolean
  isBusy: boolean
  onOpenDocument: (documentId: string) => void
  onCreateOrOpenLocation: (location: NotesHierarchyLocation) => void
  onSaveNow: () => void
}

export function NotesFileViewer({
  entries,
  activeDocumentId,
  activeCreatedMode,
  activeLocation,
  isStorageReady,
  isBusy,
  onOpenDocument,
  onCreateOrOpenLocation,
  onSaveNow,
}: NotesFileViewerProps) {
  return (
    <aside className="sticky top-4 max-[960px]:static" aria-label="Notes file viewer">
      <Card className="max-h-[calc(100svh-8rem)] max-[960px]:max-h-none" size="sm">
        <CardHeader>
          <CardTitle>File Viewer</CardTitle>
          <CardDescription>
            Open notes by Wing / Flight / Branch / Nest / Feather and save in the selected location.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Current path: {formatPath(activeLocation)} | Created for: {activeCreatedMode}
          </p>

          <NotesLocationForm
            activeLocation={activeLocation}
            isDisabled={!isStorageReady || isBusy}
            onCreateOrOpenLocation={onCreateOrOpenLocation}
            onSaveNow={onSaveNow}
          />

          <Separator />

          <NotesTreeView
            entries={entries}
            activeDocumentId={activeDocumentId}
            activeLocation={activeLocation}
            isBusy={isBusy}
            onOpenDocument={onOpenDocument}
          />
        </CardContent>
      </Card>
    </aside>
  )
}
