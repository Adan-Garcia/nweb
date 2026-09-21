import { type DBSchema, type IDBPDatabase, openDB } from "idb";

import type { Branch, Flight, Nest, Wing } from "./entity-model";
import { migrateStringPathsToEntities } from "./notes-db-upgrade";
import type { NotesDirectoryEntry, NotesDocumentRecord, NotesMediaRecord } from "./notes-model";
import type { Pebble } from "./pebble-model";
import type { Twig } from "./twig-model";

const NOTES_DB_NAME = "cuervo-notes";

/**
 * 3 added `deletedAt` to the directory entries. The bump deliberately rewrites no rows:
 * `listNotesDirectoryEntries` fills the field in on read, which also covers a database
 * whose upgrade never ran or died partway through.
 *
 * 4 made the hierarchy real. Wings, flights, branches and nests became records with ids
 * of their own, so they can be renamed; a directory entry now points at a branch and
 * carries its nests as tags instead of repeating five strings. Calendar events moved out
 * of `localStorage` and became twigs. Unlike 3, this one does rewrite rows, so the
 * migration runs inside the upgrade transaction and is all-or-nothing.
 */
export const NOTES_DB_VERSION = 4;

export interface NotesDbSchema extends DBSchema {
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
  wings: {
    key: string;
    value: Wing;
  };
  flights: {
    key: string;
    value: Flight;
  };
  branches: {
    key: string;
    value: Branch;
  };
  nests: {
    key: string;
    value: Nest;
  };
  twigs: {
    key: string;
    value: Twig;
  };
  pebbles: {
    key: string;
    value: Pebble;
  };
}

const STORE_NAMES = [
  "notes-documents",
  "notes-media",
  "notes-directory",
  "wings",
  "flights",
  "branches",
  "nests",
  "twigs",
  "pebbles",
] as const;

let dbPromise: Promise<IDBPDatabase<NotesDbSchema>> | null = null;

export function getNotesDb() {
  if (!dbPromise) {
    dbPromise = openDB<NotesDbSchema>(NOTES_DB_NAME, NOTES_DB_VERSION, {
      upgrade(database, oldVersion, _newVersion, transaction) {
        for (const storeName of STORE_NAMES) {
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, { keyPath: "id" });
          }
        }

        if (oldVersion > 0 && oldVersion < 4) {
          void migrateStringPathsToEntities(transaction);
        }
      },
    });
  }

  return dbPromise;
}

/** Test seam: the next `getNotesDb` reopens, so a suite can rebuild the database. */
export function resetNotesDbForTests() {
  dbPromise = null;
}
