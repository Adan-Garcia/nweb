import { getAutoSaveLabel } from "@/components/notes/notes-autosave-label";
import { NotesEditorArea } from "@/components/notes/notes-editor-area";
import { NotesFileViewer } from "@/components/notes/notes-file-viewer";
import { NotesLocationBar } from "@/components/notes/notes-location-bar";
import { useNoteAccess } from "@/components/notes/use-note-access";
import { useNotesLocationPicker } from "@/components/notes/use-notes-location-picker";
import { useNotesNavigation } from "@/components/notes/use-notes-navigation";
import { useNotesWorkspace } from "@/components/notes/use-notes-workspace";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { cn } from "@/lib/utils";

import "@excalidraw/excalidraw/index.css";
import "./notes.css";

export function NotesPage() {
  const { isDark, toggleTheme } = useThemeMode();
  const workspace = useNotesWorkspace();
  const picker = useNotesLocationPicker(workspace);
  const { navigationMode, chooseNavigation } = useNotesNavigation();
  const { isReadOnly } = useNoteAccess(workspace.activeDocumentId);

  const activeEntry =
    workspace.directoryEntries.find((entry) => entry.id === workspace.activeDocumentId) ?? null;
  const isShowingTree = navigationMode === "tree";

  return (
    <WorkspaceShell isDark={isDark} onToggleTheme={toggleTheme}>
      <div className="mx-auto max-w-8xl px-4 py-6 sm:px-6 lg:px-8">
        <NotesLocationBar
          picker={picker}
          snapshot={workspace.snapshot}
          autoSaveLabel={getAutoSaveLabel(workspace)}
          activeEntry={activeEntry}
          isStorageReady={workspace.isStorageReady}
          isHydratingDocument={workspace.isHydratingDocument}
          navigationMode={navigationMode}
          onChooseNavigation={chooseNavigation}
          onDeleteDocument={(documentId) => {
            void workspace.deleteDocument(documentId);
          }}
        />

        {/*
          The tree is a column beside the editor on a wide screen and stacks above it on a
          narrow one. The editor keeps `min-w-0` either way: Excalidraw's canvas will not
          shrink below its content otherwise, and a grid column would stretch to fit it.
        */}
        <div
          className={cn(
            "grid gap-4",
            isShowingTree && "min-[961px]:grid-cols-[minmax(16rem,22rem)_1fr]",
          )}
        >
          {isShowingTree ? (
            <NotesFileViewer
              snapshot={workspace.snapshot}
              entries={workspace.directoryEntries}
              activeDocumentId={workspace.activeDocumentId}
              activeCreatedMode={workspace.activeCreatedMode}
              activeSelection={workspace.activeSelection}
              isStorageReady={workspace.isStorageReady}
              isBusy={workspace.isHydratingDocument}
              onOpenDocument={(documentId) => {
                void workspace.openDocumentById(documentId);
              }}
              onRenameDocument={(documentId, feather) => {
                void workspace.renameDocument(documentId, feather);
              }}
              onDeleteDocument={(documentId) => {
                void workspace.deleteDocument(documentId);
              }}
              onSaveNow={() => {
                void workspace.saveActiveDocumentNow();
              }}
            />
          ) : null}

          <div className="min-w-0">
            <NotesEditorArea workspace={workspace} isDark={isDark} isReadOnly={isReadOnly} />
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
