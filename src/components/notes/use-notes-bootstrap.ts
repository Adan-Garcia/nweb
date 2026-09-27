import { useEffect } from "react";

import type { NotesDirectoryEntry, NotesDocumentMode } from "@/components/notes/types";
import { ensureDefaultWorkspace, loadWorkspaceSnapshot } from "@/lib/hierarchy/workspace-storage";
import type { WorkspaceSnapshot } from "@/lib/hierarchy/workspace-tree";
import { revokeObjectUrls } from "@/lib/media/blob-utils";
import {
  createNotesDirectoryEntry,
  listNotesDirectoryEntries,
  upsertNotesDirectoryEntry,
} from "@/lib/notes/notes-directory-storage";
import { loadNotesDocument } from "@/lib/notes/notes-document-storage";
import { DEFAULT_NOTES_DOCUMENT_ID } from "@/lib/notes/notes-model";

type UseNotesBootstrapOptions = {
  hydrateDocument: (documentId: string, targetMode?: NotesDocumentMode) => Promise<void>;
  applyInitialEntries: (
    snapshot: WorkspaceSnapshot,
    entries: NotesDirectoryEntry[],
    initialEntry: NotesDirectoryEntry,
  ) => void;
  markStorageReady: () => void;
};

/**
 * On mount: makes sure there is a wing, flight and branch to file a note under, that at
 * least one note exists (adopting the legacy single-document note if present), opens the
 * most recent one, and reports storage as ready.
 */
export function useNotesBootstrap({
  hydrateDocument,
  applyInitialEntries,
  markStorageReady,
}: UseNotesBootstrapOptions) {
  useEffect(() => {
    let isMounted = true;

    const hydrateNotes = async () => {
      try {
        const { path } = await ensureDefaultWorkspace();
        let existingEntries = await listNotesDirectoryEntries();

        if (!existingEntries.length) {
          const legacyDocument = await loadNotesDocument(DEFAULT_NOTES_DOCUMENT_ID);

          if (legacyDocument) {
            await upsertNotesDirectoryEntry({
              id: DEFAULT_NOTES_DOCUMENT_ID,
              branchId: path.branch.id,
              feather: "Legacy note",
              createdMode: "linear",
            });

            revokeObjectUrls(legacyDocument.objectUrls);
          } else {
            await createNotesDirectoryEntry({
              branchId: path.branch.id,
              feather: "Untitled note",
              createdMode: "linear",
            });
          }

          existingEntries = await listNotesDirectoryEntries();
        }

        const snapshot = await loadWorkspaceSnapshot();

        if (!isMounted || !existingEntries.length) {
          return;
        }

        const initialEntry = existingEntries[0];

        applyInitialEntries(snapshot, existingEntries, initialEntry);
        await hydrateDocument(initialEntry.id, initialEntry.createdMode);
      } catch {
        return;
      } finally {
        if (isMounted) {
          markStorageReady();
        }
      }
    };

    void hydrateNotes();

    return () => {
      isMounted = false;
    };
  }, [applyInitialEntries, hydrateDocument, markStorageReady]);
}
