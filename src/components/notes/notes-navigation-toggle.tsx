import { ListTree, Route } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { NotesNavigationMode } from "@/lib/notes-navigation";

type NotesNavigationToggleProps = {
  navigationMode: NotesNavigationMode;
  onChoose: (mode: NotesNavigationMode) => void;
};

/** Pick a way of getting to a note. Both reach the same notes; neither is the "real" one. */
export function NotesNavigationToggle({ navigationMode, onChoose }: NotesNavigationToggleProps) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Navigate notes by">
      <Button
        type="button"
        size="sm"
        variant={navigationMode === "path" ? "default" : "ghost"}
        aria-pressed={navigationMode === "path"}
        onClick={() => {
          onChoose("path");
        }}
      >
        <Route className="size-4" />
        Path
      </Button>
      <Button
        type="button"
        size="sm"
        variant={navigationMode === "tree" ? "default" : "ghost"}
        aria-pressed={navigationMode === "tree"}
        onClick={() => {
          onChoose("tree");
        }}
      >
        <ListTree className="size-4" />
        Tree
      </Button>
    </div>
  );
}
