import { WorkspaceShell } from "@/components/workspace-shell";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { getAutoSaveLabel } from "@/components/notes/notes-autosave-label";
import { NotesEditorArea } from "@/components/notes/notes-editor-area";
import { NotesLocationBar } from "@/components/notes/notes-location-bar";
import { useNotesLocationPicker } from "@/components/notes/use-notes-location-picker";
import { useNotesWorkspace } from "@/components/notes/use-notes-workspace";

import "@excalidraw/excalidraw/index.css";
import "./notes.css";

export function NotesPage() {
  const { isDark, toggleTheme } = useThemeMode();
  const workspace = useNotesWorkspace();
  const picker = useNotesLocationPicker(workspace);

  return (
    <WorkspaceShell isDark={isDark} onToggleTheme={toggleTheme}>
      <div className="mx-auto max-w-8xl px-4 py-6 sm:px-6 lg:px-8">
        <NotesLocationBar
          picker={picker}
          autoSaveLabel={getAutoSaveLabel(workspace)}
          isStorageReady={workspace.isStorageReady}
          isHydratingDocument={workspace.isHydratingDocument}
        />

        <div className="notes-main-editor">
          <NotesEditorArea workspace={workspace} isDark={isDark} />
        </div>
      </div>
    </WorkspaceShell>
  );
}
