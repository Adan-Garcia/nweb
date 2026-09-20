import { type DBSchema, type IDBPDatabase, openDB } from "idb";

import type { NotesDirectoryEntry, NotesDocumentRecord, NotesMediaRecord } from "./notes-model";

const NOTES_DB_NAME = "cuervo-notes";
const NOTES_DB_VERSION = 2;

interface NotesDbSchema extends DBSchema {
  "notes-documents": {
    key: string;
    value: NotesDocumentRecord;
  };
  "notes-media": {
    key: string;
    value: NotesMediaRecord;
  };
  "notes-directory": {
    key: string;
    value: NotesDirectoryEntry;
  };
}

let dbPromise: Promise<IDBPDatabase<NotesDbSchema>> | null = null;

export function getNotesDb() {
  if (!dbPromise) {
    dbPromise = openDB<NotesDbSchema>(NOTES_DB_NAME, NOTES_DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("notes-documents")) {
          database.createObjectStore("notes-documents", {
            keyPath: "id",
          });
        }

        if (!database.objectStoreNames.contains("notes-media")) {
          database.createObjectStore("notes-media", {
            keyPath: "id",
          });
        }

        if (!database.objectStoreNames.contains("notes-directory")) {
          database.createObjectStore("notes-directory", {
            keyPath: "id",
          });
        }
      },
    });
  }

  return dbPromise;
}
