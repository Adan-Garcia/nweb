import {
  type Cipher,
  getActiveCipher,
  plaintextCipher,
  resetActiveCipher,
  setActiveCipher,
} from "./cipher";
import { createKeyId } from "./cipher";
import { createKdfParams } from "./kdf";
import { getNotesDb } from "./notes-db";
import {
  clearRekeyJournal,
  readRekeyJournal,
  REKEY_JOURNAL_ID,
  REKEY_STORES,
  type RekeyJournal,
  type RekeySide,
  writeRekeyJournal,
} from "./rekey-journal";
import {
  cipherFor,
  isWorkspaceLockSet,
  opensVerifier,
  readLockRecord,
  unlockWorkspace,
  verifierFor,
  writeLockHint,
} from "./workspace-lock";
import { WORKSPACE_LOCK_ID } from "./workspace-lock-model";
import { countRekeyRows, type RekeyProgress, rewriteStoredContent } from "./workspace-rekey";

/**
 * Setting a passphrase, changing it, removing it, and finishing any of the three after an
 * interruption. All four are the same operation — rewrite every row from one cipher to
 * another — differing only in what is on each side and what is left behind afterwards.
 *
 * Every one of them writes a journal first and clears it last, so a workspace is never in
 * a half-converted state that nothing knows how to get out of.
 */
export type { RekeyProgress };

type RekeyRun = {
  source: RekeySide;
  target: RekeySide;
  from: Cipher;
  to: Cipher;
  createdAt: number;
  onProgress?: (progress: RekeyProgress) => void;
};

/**
 * What a finished rekey leaves behind: the new lock record, or no lock at all. The journal
 * goes last, because until it is gone the job is not done.
 */
async function finishRekey(target: RekeySide, createdAt: number) {
  const database = await getNotesDb();

  if (target) {
    await database.put("workspace-keys", {
      id: WORKSPACE_LOCK_ID,
      kdf: target.kdf,
      keyId: target.keyId,
      verifier: target.verifier,
      createdAt,
      updatedAt: Date.now(),
    });
  } else {
    await database.delete("workspace-keys", WORKSPACE_LOCK_ID);
  }

  writeLockHint(Boolean(target));
  await clearRekeyJournal();
}

/**
 * A second rekey started over an unfinished one would overwrite its journal, and with it
 * the only record of the key half the rows are under. The shell does not offer the chance
 * — an interrupted workspace shows the resume screen instead of the settings page — but
 * the state that cannot be recovered from is not one to leave guarded only by a screen.
 */
async function refuseIfUnfinished() {
  if (await readRekeyJournal()) {
    throw new Error("A passphrase change was interrupted and has to be finished first.");
  }
}

async function runRekey({ source, target, from, to, createdAt, onProgress }: RekeyRun) {
  await refuseIfUnfinished();

  const journal: RekeyJournal = {
    id: REKEY_JOURNAL_ID,
    source,
    target,
    store: REKEY_STORES[0],
    lastKey: null,
    done: 0,
    total: await countRekeyRows(),
    startedAt: Date.now(),
  };

  await writeRekeyJournal(journal);
  await rewriteStoredContent({ from, to, journal, onProgress });
  await finishRekey(target, createdAt);
}

/**
 * Chooses the passphrase and encrypts what is already stored.
 *
 * The rewrite is the part that matters: without it, turning the lock on would leave every
 * note written so far sitting in plaintext behind a screen that merely refuses to show it.
 * The lock record is written last, so a failure partway through leaves the workspace
 * readable by the passphrase that is about to finish the job, not sealed with no way in.
 */
export async function createWorkspaceLock(
  passphrase: string,
  onProgress?: (progress: RekeyProgress) => void,
): Promise<void> {
  if (await isWorkspaceLockSet()) {
    throw new Error("This workspace already has a passphrase.");
  }

  const kdf = createKdfParams();
  const keyId = createKeyId();
  const cipher = await cipherFor(passphrase, kdf, keyId);

  await runRekey({
    source: null,
    target: { kdf, keyId, verifier: await verifierFor(cipher) },
    from: plaintextCipher,
    to: cipher,
    createdAt: Date.now(),
    onProgress,
  });

  setActiveCipher(cipher);
}

/**
 * Moves the workspace from one passphrase to another in a single pass.
 *
 * Remove-then-set would do it in two, and would leave every note in plaintext on disk in
 * between — a window where a crash, or anyone reading the profile directory, gets the lot.
 * Rewriting straight from the old cipher to the new one never writes a readable row.
 */
export async function changeWorkspacePassphrase(
  currentPassphrase: string,
  nextPassphrase: string,
  onProgress?: (progress: RekeyProgress) => void,
): Promise<boolean> {
  const record = await readLockRecord();

  if (!record || !(await unlockWorkspace(currentPassphrase))) {
    return false;
  }

  const kdf = createKdfParams();
  const keyId = createKeyId();
  const next = await cipherFor(nextPassphrase, kdf, keyId);

  await runRekey({
    source: { kdf: record.kdf, keyId: record.keyId ?? "", verifier: record.verifier },
    target: { kdf, keyId, verifier: await verifierFor(next) },
    from: getActiveCipher(),
    to: next,
    createdAt: record.createdAt,
    onProgress,
  });

  setActiveCipher(next);
  return true;
}

/**
 * Removes the passphrase and writes everything back as plaintext, so a user who no longer
 * wants the lock is not trapped behind it.
 */
export async function removeWorkspaceLock(
  passphrase: string,
  onProgress?: (progress: RekeyProgress) => void,
): Promise<boolean> {
  const record = await readLockRecord();

  if (!record || !(await unlockWorkspace(passphrase))) {
    return false;
  }

  await runRekey({
    source: { kdf: record.kdf, keyId: record.keyId ?? "", verifier: record.verifier },
    target: null,
    from: getActiveCipher(),
    to: plaintextCipher,
    createdAt: record.createdAt,
    onProgress,
  });

  resetActiveCipher();
  return true;
}

/** Derives a side's key and checks it against the verifier the journal recorded for it. */
async function sideCipher(side: RekeySide, passphrase: string | undefined): Promise<Cipher | null> {
  if (!side) {
    return plaintextCipher;
  }

  if (!passphrase) {
    return null;
  }

  try {
    const cipher = await cipherFor(passphrase, side.kdf, side.keyId);

    return (await opensVerifier(cipher, side.verifier)) ? cipher : null;
  } catch {
    return null;
  }
}

/**
 * Finishes a rekey that was interrupted, from wherever it got to.
 *
 * Both keys are needed, which is why the journal carries both sides' parameters: the rows
 * that have not moved yet only open with the old one, and the rows that have only open
 * with the new. A workspace being locked for the first time has no old key and one being
 * unlocked for good has no new one, so those two only ask for a single passphrase.
 *
 * Returns false for a passphrase that does not match what the journal recorded, which is
 * checked before a single row is touched.
 */
export async function resumeRekey(
  passphrases: { source?: string; target?: string },
  onProgress?: (progress: RekeyProgress) => void,
): Promise<boolean> {
  const journal = await readRekeyJournal();

  if (!journal) {
    return false;
  }

  const from = await sideCipher(journal.source, passphrases.source);
  const to = await sideCipher(journal.target, passphrases.target);

  if (!from || !to) {
    return false;
  }

  await rewriteStoredContent({ from, to, journal, onProgress });
  await finishRekey(journal.target, journal.startedAt);

  setActiveCipher(to);
  return true;
}
