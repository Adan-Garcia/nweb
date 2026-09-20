import { CircleCheck } from "lucide-react";

import { formatLastUpdated, toLocationLabel } from "@/components/dashboard/dashboard-metrics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NotesDirectoryEntry } from "@/lib/notes-model";

type RecentNotesCardProps = {
  notes: NotesDirectoryEntry[];
  isLoading: boolean;
};

export function RecentNotesCard({ notes, isLoading }: RecentNotesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Notes</CardTitle>
        <CardDescription>Your latest note activity from saved workspace documents.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading saved notes...</p>
        ) : notes.length ? (
          notes.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="line-clamp-1 text-sm font-semibold">{toLocationLabel(entry)}</p>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{entry.createdMode === "spatial" ? "Spatial" : "Linear"} note</span>
                <span>{formatLastUpdated(entry.updatedAt)}</span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No saved notes yet. Create one in Notes to start building your library.
          </p>
        )}

        <Button
          variant="outline"
          className="w-full"
          nativeButton={false}
          render={<a href="/notes" />}
        >
          <CircleCheck className="size-4" />
          Open notes workspace
        </Button>
      </CardContent>
    </Card>
  );
}
