import type { WorkspaceSelection } from "@/components/notes/location-hierarchy";
import { segmentLabels } from "@/components/notes/location-hierarchy";
import { NotesTreeView } from "@/components/notes/notes-tree-view";
import type { NotesDirectoryEntry, NotesDocumentMode } from "@/components/notes/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatLocationPath, type WorkspaceSnapshot } from "@/lib/workspace-tree";

type NotesFileViewerProps = {
  snapshot: WorkspaceSnapshot;
  entries: NotesDirectoryEntry[];
  activeDocumentId: string | null;
  activeCreatedMode: NotesDocumentMode;
  activeSelection: WorkspaceSelection;
  isStorageReady: boolean;
  isBusy: boolean;
  onOpenDocument: (documentId: string) => void;
  onRenameDocument: (documentId: string, feather: string) => void;
  onDeleteDocument: (documentId: string) => void;
  onSaveNow: () => void;
};

export function NotesFileViewer({
  snapshot,
  entries,
  activeDocumentId,
  activeCreatedMode,
  activeSelection,
  isStorageReady,
  isBusy,
  onOpenDocument,
  onRenameDocument,
  onDeleteDocument,
  onSaveNow,
}: NotesFileViewerProps) {
  const currentPath = formatLocationPath(segmentLabels(snapshot, entries, activeSelection));

  return (
    <aside className="sticky top-4 max-[960px]:static" aria-label="Notes file viewer">
      <Card className="max-h-[calc(100svh-8rem)] max-[960px]:max-h-none" size="sm">
        <CardHeader>
          <CardTitle>File Viewer</CardTitle>
          <CardDescription>
            Open, rename or delete a note. Renaming a wing, flight, branch or nest instead is on the
            settings page, and renames it everywhere at once.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Current path: {currentPath} | Created for: {activeCreatedMode}
          </p>

          <Button
            type="button"
            variant="outline"
            onClick={onSaveNow}
            disabled={!isStorageReady || isBusy}
          >
            Save Active Note
          </Button>

          <Separator />

          <NotesTreeView
            snapshot={snapshot}
            entries={entries}
            activeDocumentId={activeDocumentId}
            activeSelection={activeSelection}
            isBusy={isBusy}
            onOpenDocument={onOpenDocument}
            onRenameDocument={onRenameDocument}
            onDeleteDocument={onDeleteDocument}
          />
        </CardContent>
      </Card>
    </aside>
  );
}
