import { useEffect } from "react";

import type { NotesDirectoryEntry, NotesDocumentMode } from "@/components/notes/types";
import { revokeObjectUrls } from "@/lib/blob-utils";
import {
  createNotesDirectoryEntry,
  listNotesDirectoryEntries,
  upsertNotesDirectoryEntry,
} from "@/lib/notes-directory-storage";
import { loadNotesDocument } from "@/lib/notes-document-storage";
import { DEFAULT_NOTES_DOCUMENT_ID } from "@/lib/notes-model";
import { ensureDefaultWorkspace, loadWorkspaceSnapshot } from "@/lib/workspace-storage";
import type { WorkspaceSnapshot } from "@/lib/workspace-tree";

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
