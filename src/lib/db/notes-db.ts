import { type DBSchema, type IDBPDatabase, openDB } from "idb";

import type { AccountRecord } from "../account/account-record";
import type { LocalAccount } from "../account/local-account";
import type { FeedRecord } from "../feeds/feed-model";
import type { Branch, Flight, Nest, Wing } from "../hierarchy/entity-model";
import type { Pebble } from "../hierarchy/pebble-model";
import type { SharePathRecord } from "../hierarchy/share-path-model";
import type { RekeyJournal } from "../lock/rekey-journal";
import type { WorkspaceLockRecord } from "../lock/workspace-lock-model";
import type {
  NotesDirectoryEntry,
  NotesDocumentRecord,
  NotesMediaRecord,
} from "../notes/notes-model";
import type { Preferences } from "../preferences/preferences-model";
import type { SyncBaseRecord } from "../sync/reconcile";
import type { Twig } from "../twigs/twig-model";
import { migrateStringPathsToEntities } from "./notes-db-upgrade";

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
 *
 * 5 added `workspace-keys`, which holds the KDF parameters and the verifier for the app
 * lock. One row, and no content: losing it costs the passphrase, not the notes.
 *
 * 6 let the lock cover the names a workspace is listed by. Every named row — notes,
 * wings, flights, branches, nests, twigs, pebbles — may now carry an `encryption` marker
 * saying which cipher wrote its one display field. Like 3, this rewrites no rows: a row
 * without the marker is plaintext, which is what every row written before this one is,
 * and turning the lock on is what converts them.
 *
 * 7 added `workspace-rekey`, which holds the journal for a rekey in progress. One row,
 * present only while a passphrase is being set, changed or removed, and what makes an
 * interrupted rewrite something the next load can finish rather than a broken workspace.
 *
 * 8 gave a twig a due time a machine can act on: `dueMinutes` beside the free text, and
 * the IANA zone that wall clock belongs to. Like 3 it rewrites no rows — `listTwigs` fills
 * the field in from the text already in the row, so a row heals the first time it is read.
 *
 * 9 added `keyId` beside `encryption` on every sealed row. `encryption` says how a row was
 * sealed, which is enough while a browser has one key; it stops being enough once a key
 * can be replaced, because after a passphrase change both sides say `aes-gcm`. Rewrites no
 * rows either: a row without an id predates ids, and the workspace has only ever had one
 * key at a time, so it is taken at its word until the next rekey stamps it.
 *
 * 10 added `account`, which holds the one account this device is signed in to: the sealed
 * key material the server already has, this workspace's own wrapped root key, and the last
 * key graph it was handed. One row, all of it public or sealed, and kept locally so that
 * signing in once is enough to open the workspace offline ever after. Rewrites no rows: a
 * database with no account row is a device that has never signed in, which is every one of
 * them until it does.
 *
 * 11 added two stores and rewrote nothing. `sync-bases` keeps the last version of each row
 * the server handed over, sealed exactly as it arrived, so that two edits of one row can be
 * merged against the version both started from instead of one silently replacing the other.
 * `share-paths` holds the names above something shared — the course, term and wing a note
 * sits in — sealed under the shared thing's own key, so a recipient can show where it lives
 * without being handed a key that would open its siblings.
 *
 * 12 added `preferences`: one row holding how someone has arranged the app — theme, accent,
 * density, the order of the sidebar. It syncs, so it lives here and not only in the
 * `localStorage` cache the first paint reads. Rewrites no rows: with no row, the cache (or
 * the old `theme` key it falls back to) is written here the first time the app loads.
 *
 * 13 added `local-account`: who this device belongs to — a name and an email — beside the
 * passphrase the lock record already holds. A local account is now required to open the
 * workspace; a server account stays optional. Rewrites no rows: a database without one is
 * asked to set one up, keeping the passphrase it already has.
 *
 * 14 added `feeds`: the calendars this device subscribes to, their settings sealed as one
 * string (`lib/feeds/feed-storage.ts`), and gave a twig a `feedId` saying which feed made
 * it. Rewrites no rows: a twig without the field was typed in by hand, which is what every
 * twig written before this one was, and `listTwigs` reads the absence as null.
 */
export const NOTES_DB_VERSION = 14;

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
  "workspace-keys": {
    key: string;
    value: WorkspaceLockRecord;
  };
  "workspace-rekey": {
    key: string;
    value: RekeyJournal;
  };
  account: {
    key: string;
    value: AccountRecord;
  };
  "sync-bases": {
    key: string;
    value: SyncBaseRecord;
  };
  "share-paths": {
    key: string;
    value: SharePathRecord;
  };
  preferences: {
    key: string;
    value: Preferences;
  };
  "local-account": {
    key: string;
    value: LocalAccount;
  };
  feeds: {
    key: string;
    value: FeedRecord;
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
  "workspace-keys",
  "workspace-rekey",
  "account",
  "sync-bases",
  "share-paths",
  "preferences",
  "local-account",
  "feeds",
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
      // Another tab is upgrading or erasing the database: step aside rather than block it.
      // The next `getNotesDb` reopens.
      blocking() {
        void dbPromise?.then((database) => database.close());
        dbPromise = null;
      },
    });
  }

  return dbPromise;
}

/**
 * Deletes the whole database: every note, task, file, key and setting on this device.
 *
 * The open connection is closed first, or the delete waits on it forever ("blocked"). What
 * a server holds is untouched; this is the device forgetting, not the account.
 */
export async function eraseNotesDb(): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(NOTES_DB_NAME);

    // Resolved on success only. "Blocked" means another tab still has it open; every
    // connection closes itself when asked (`blocking` above), and the delete then completes.
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not erase the database."));
  });
}
