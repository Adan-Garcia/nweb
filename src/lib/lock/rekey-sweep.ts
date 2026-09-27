import type { Cipher, CipherMarker } from "../crypto/cipher";
import {
  REKEY_STORES,
  type RekeyJournal,
  type RekeyStore,
  writeRekeyJournal,
} from "./rekey-journal";

/**
 * The mechanics a rekey sweep is built from: how it decides a row has already moved, and
 * how it remembers where it got to. Kept apart from the rewriting itself so that each file
 * says one thing.
 */
export type RekeyProgress = { done: number; total: number };

export type CipherPair = { from: Cipher; to: Cipher };

/** How often the cursor is written down. The cursor is an optimisation, not a guarantee. */
const CHECKPOINT_EVERY = 25;

/**
 * Whether this row has already been moved to the far side of the rewrite.
 *
 * It is a comparison rather than an attempt because a key has an id. Before ids the only
 * way to ask was to try both keys and see which one worked — which is ambiguous exactly
 * when it matters, since a passphrase change leaves both sides saying `aes-gcm`.
 */
export function alreadyMoved(marker: CipherMarker, to: Cipher): boolean {
  return (marker.keyId ?? "") === to.keyId && (marker.encryption ?? "none") === to.name;
}

/**
 * Where the sweep has got to, written down every so often so a resume can skip ahead.
 *
 * A closure rather than a class: `erasableSyntaxOnly` rules out parameter properties, and
 * there is nothing here a plain function does not express.
 */
export function createRekeyCursor(
  start: RekeyJournal,
  onProgress?: (progress: RekeyProgress) => void,
) {
  let journal = start;
  let sinceCheckpoint = 0;

  return {
    /** True for a row an earlier run of this same rekey already finished. */
    skips(store: RekeyStore, key: string) {
      const reached = REKEY_STORES.indexOf(journal.store);
      const here = REKEY_STORES.indexOf(store);

      if (here < reached) {
        return true;
      }

      return here === reached && journal.lastKey !== null ? key <= journal.lastKey : false;
    },

    async advance(store: RekeyStore, key: string) {
      journal = { ...journal, store, lastKey: key, done: journal.done + 1 };
      sinceCheckpoint += 1;
      onProgress?.({ done: journal.done, total: journal.total });

      if (sinceCheckpoint >= CHECKPOINT_EVERY) {
        sinceCheckpoint = 0;
        await writeRekeyJournal(journal);
      }
    },
  };
}

export type RekeyCursor = ReturnType<typeof createRekeyCursor>;
