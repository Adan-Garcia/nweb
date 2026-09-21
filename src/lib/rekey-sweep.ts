import type { Cipher } from "./cipher";
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
 * Opens a payload with the cipher the rewrite is moving away from, or reports that this
 * row has already been moved.
 *
 * A resumed rekey walks rows it may have converted already, and they cannot be told apart
 * by their marker: changing a passphrase leaves both sides saying `aes-gcm`. So the answer
 * comes from trying. A row that opens with neither key is a real failure, raised as the
 * first of the two, because "the key this row names does not work" is the useful half.
 */
export async function openEither<T>(
  open: (cipher: Cipher) => Promise<T>,
  { from, to }: CipherPair,
): Promise<{ value: T; alreadyMoved: boolean }> {
  try {
    return { value: await open(from), alreadyMoved: false };
  } catch (fromError) {
    try {
      return { value: await open(to), alreadyMoved: true };
    } catch {
      throw fromError;
    }
  }
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
