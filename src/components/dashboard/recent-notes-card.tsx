import { CircleCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { formatLastUpdated, toLocationLabel } from "@/components/dashboard/dashboard-metrics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NotesDirectoryEntry } from "@/lib/notes-model";
import type { WorkspaceSnapshot } from "@/lib/workspace-tree";

type RecentNotesCardProps = {
  snapshot: WorkspaceSnapshot;
  notes: NotesDirectoryEntry[];
  isLoading: boolean;
};

export function RecentNotesCard({ snapshot, notes, isLoading }: RecentNotesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Notes</CardTitle>
        <CardDescription>Your latest note activity from saved workspace documents.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading saved notes...</p>
        ) : notes.length ? (
          notes.map((entry) => (
            <div
              key={entry.id}
              className="rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
            >
              <p className="line-clamp-1 text-sm font-semibold">
                {toLocationLabel(snapshot, entry)}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{entry.createdMode === "spatial" ? "Spatial" : "Linear"} note</span>
                <span>{formatLastUpdated(entry.updatedAt)}</span>
              </div>
            </div>
          ))
        ) : (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            No saved notes yet. Create one in Notes to start building your library.
          </p>
        )}

        <Button
          variant="outline"
          className="mt-2 w-full"
          nativeButton={false}
          render={<Link to="/notes" />}
        >
          <CircleCheck className="size-4" />
          Open notes workspace
        </Button>
      </CardContent>
    </Card>
  );
}
