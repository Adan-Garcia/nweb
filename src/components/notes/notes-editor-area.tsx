import { LinearNotesEditor } from "@/components/notes/linear-notes-editor";
import { SpatialNotesEditor } from "@/components/notes/spatial-notes-editor";
import type { useNotesWorkspace } from "@/components/notes/use-notes-workspace";

type EditorWorkspace = Pick<
  ReturnType<typeof useNotesWorkspace>,
  | "mode"
  | "linearContent"
  | "setLinearContent"
  | "isSpatialEditorReloading"
  | "activeDocumentId"
  | "spatialEditorReloadKey"
  | "spatialHostRef"
  | "spatialInitialData"
  | "handleSpatialChange"
  | "handleSpatialPaste"
>;

type NotesEditorAreaProps = {
  workspace: EditorWorkspace;
  isDark: boolean;
  /** Shared with this account to read, not to change. */
  isReadOnly?: boolean;
};

/** The active note's editor: rich text, or the Excalidraw canvas. */
export function NotesEditorArea({ workspace, isDark, isReadOnly = false }: NotesEditorAreaProps) {
  const notice = isReadOnly ? (
    <p role="status" className="m-0 mb-2 text-sm text-muted-foreground">
      Shared with you to read. Only people it was shared with to edit can change it.
    </p>
  ) : null;

  if (workspace.mode === "linear") {
    return (
      <>
        {notice}
        <LinearNotesEditor
          value={workspace.linearContent}
          onChange={workspace.setLinearContent}
          isReadOnly={isReadOnly}
        />
      </>
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
    <>
      {notice}
      <SpatialNotesEditor
        key={`${workspace.activeDocumentId ?? "notes-empty"}-${workspace.spatialEditorReloadKey}`}
        isDark={isDark}
        hostRef={workspace.spatialHostRef}
        initialData={workspace.spatialInitialData}
        onChange={workspace.handleSpatialChange}
        onPaste={workspace.handleSpatialPaste}
        isReadOnly={isReadOnly}
      />
    </>
  );
}
