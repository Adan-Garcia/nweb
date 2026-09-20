import { LinearNotesEditor } from "@/components/notes/linear-notes-editor";
import { SpatialNotesEditor } from "@/components/notes/spatial-notes-editor";
import type { useNotesWorkspace } from "@/components/notes/use-notes-workspace";

type NotesEditorAreaProps = {
  workspace: ReturnType<typeof useNotesWorkspace>;
  isDark: boolean;
};

/** The active note's editor: rich text, or the Excalidraw canvas. */
export function NotesEditorArea({ workspace, isDark }: NotesEditorAreaProps) {
  if (workspace.mode === "linear") {
    return (
      <LinearNotesEditor value={workspace.linearContent} onChange={workspace.setLinearContent} />
    );
  }

  if (workspace.isSpatialEditorReloading) {
    return (
      <div className="flex min-h-105 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Reloading spatial note...
      </div>
    );
  }

  return (
    <SpatialNotesEditor
      key={`${workspace.activeDocumentId ?? "notes-empty"}-${workspace.spatialEditorReloadKey}`}
      isDark={isDark}
      hostRef={workspace.spatialHostRef}
      initialData={workspace.spatialInitialData}
      onChange={workspace.handleSpatialChange}
      onPaste={workspace.handleSpatialPaste}
    />
  );
}
