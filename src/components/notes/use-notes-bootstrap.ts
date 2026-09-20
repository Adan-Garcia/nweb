import { useEffect } from "react";

import { buildNotesDocumentId } from "@/components/notes/constants";
import { FALLBACK_LOCATION } from "@/components/notes/location-hierarchy";
import type { NotesDirectoryEntry, NotesDocumentMode } from "@/components/notes/types";
import { revokeObjectUrls } from "@/lib/blob-utils";
import {
  listNotesDirectoryEntries,
  upsertNotesDirectoryEntry,
} from "@/lib/notes-directory-storage";
import { loadNotesDocument } from "@/lib/notes-document-storage";
import { DEFAULT_NOTES_DOCUMENT_ID } from "@/lib/notes-model";

type UseNotesBootstrapOptions = {
  hydrateDocument: (documentId: string, targetMode?: NotesDocumentMode) => Promise<void>;
  applyInitialEntries: (entries: NotesDirectoryEntry[], initialEntry: NotesDirectoryEntry) => void;
  markStorageReady: () => void;
};

/**
 * On mount: makes sure at least one note exists (adopting the legacy
 * single-document note if present), opens the most recent one, and reports
 * storage as ready.
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
        let existingEntries = await listNotesDirectoryEntries();

        if (!existingEntries.length) {
          const legacyDocument = await loadNotesDocument(DEFAULT_NOTES_DOCUMENT_ID);

          if (legacyDocument) {
            await upsertNotesDirectoryEntry({
              id: DEFAULT_NOTES_DOCUMENT_ID,
              location: {
                ...FALLBACK_LOCATION,
                feather: "Legacy note",
              },
              createdMode: "linear",
            });

            revokeObjectUrls(legacyDocument.objectUrls);
          } else {
            const initialDocumentId = buildNotesDocumentId(FALLBACK_LOCATION);

            await upsertNotesDirectoryEntry({
              id: initialDocumentId,
              location: FALLBACK_LOCATION,
              createdMode: "linear",
            });
          }

          existingEntries = await listNotesDirectoryEntries();
        }

        if (!isMounted || !existingEntries.length) {
          return;
        }

        const initialEntry = existingEntries[0];

        applyInitialEntries(existingEntries, initialEntry);
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
