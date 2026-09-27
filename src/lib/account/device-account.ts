import { setApiSession } from "../api/session-store";
import { resetActiveCipher } from "../crypto/cipher";
import { eraseNotesDb } from "../db/notes-db";
import { forgetKeyring } from "../keys/object-keys";
import { lockCipherFor, resetLockRecord } from "../lock/lock-record";
import { readLockRecord, unlockWorkspace } from "../lock/workspace-lock";
import {
  changeWorkspacePassphrase,
  createWorkspaceLock,
  type RekeyProgress,
} from "../lock/workspace-passphrase";
import { resetSyncState } from "../sync/sync-service";
import { openAccountKeys } from "./account-keys";
import { readAccountRecord } from "./account-record";
import { unlockAccount } from "./adopt-account";
import { type LocalAccountProfile, readLocalAccount, writeLocalAccount } from "./local-account";
import { changeServerPassphrase, openAccountSession } from "./server-disconnect";

/**
 * The local account: the one every device must have before its workspace opens.
 *
 * It is a name, an email and a passphrase. The passphrase is the lock — on a device with a
 * server account, the account's passphrase, since the two are one — so everything here is
 * the lock and the account seen from the one place that knows which of them applies.
 */
export type CreateLocalFailure = "exists" | "wrong-passphrase";

/**
 * Sets up the local account. A new device gets a lock with this passphrase, and whatever is
 * already stored is encrypted under it. A device from before local accounts keeps the
 * passphrase it has — this one has to be it — and simply gains a name and an email.
 */
export async function createLocalAccount(
  profile: LocalAccountProfile & { passphrase: string },
  onProgress?: (progress: RekeyProgress) => void,
): Promise<{ ok: true } | { ok: false; reason: CreateLocalFailure }> {
  if (await readLocalAccount()) {
    return { ok: false, reason: "exists" };
  }

  if (await readAccountRecord()) {
    // An older device that joined a server account: its passphrase is the account's.
    if (!(await unlockAccount(profile.passphrase)).ok) {
      return { ok: false, reason: "wrong-passphrase" };
    }

    if (!(await readLockRecord())) {
      await resetLockRecord(profile.passphrase);
    }
  } else if (await readLockRecord()) {
    if (!(await unlockWorkspace(profile.passphrase))) {
      return { ok: false, reason: "wrong-passphrase" };
    }
  } else {
    await createWorkspaceLock(profile.passphrase, onProgress);
  }

  await writeLocalAccount({ name: profile.name, email: profile.email });

  return { ok: true };
}

/**
 * Opens this device with its passphrase: through the account's keys when it is on a server
 * account, through the lock when it is not. A session is opened afterwards, in the
 * background — the notes are readable the moment the keys are, network or not.
 */
export async function unlockDevice(passphrase: string): Promise<boolean> {
  if (await readAccountRecord()) {
    if (!(await unlockAccount(passphrase)).ok) {
      return false;
    }

    void openAccountSession(passphrase).catch(() => false);
    return true;
  }

  return unlockWorkspace(passphrase);
}

/** Whether this is the device's passphrase, without unlocking anything. */
export async function verifyDevicePassphrase(passphrase: string): Promise<boolean> {
  const record = await readAccountRecord();

  if (record) {
    return Boolean(await openAccountKeys(passphrase, record.material));
  }

  return Boolean(await lockCipherFor(passphrase));
}

export type ChangePassphraseFailure = "wrong-passphrase" | "unreachable" | "failed";

/**
 * A new passphrase. On a server account it is one re-wrapped key and needs the server; on
 * a local-only device it rewrites every row, which is why it reports progress.
 */
export async function changeDevicePassphrase(
  current: string,
  next: string,
  onProgress?: (progress: RekeyProgress) => void,
): Promise<{ ok: true } | { ok: false; reason: ChangePassphraseFailure }> {
  if (await readAccountRecord()) {
    const changed = await changeServerPassphrase(current, next);

    return changed.ok
      ? changed
      : {
          ok: false,
          reason: changed.reason === "unreachable" ? "unreachable" : "wrong-passphrase",
        };
  }

  try {
    return (await changeWorkspacePassphrase(current, next, onProgress))
      ? { ok: true }
      : { ok: false, reason: "wrong-passphrase" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Forgets everything on this device: every note, key and setting, and the local account.
 * A server account, if there is one, is not touched — deleting that is its own step.
 */
export async function eraseDevice(): Promise<void> {
  setApiSession(null);
  resetSyncState();
  forgetKeyring();
  resetActiveCipher();
  await eraseNotesDb();

  try {
    window.localStorage.clear();
  } catch {
    // Blocked storage holds nothing this app could read back anyway.
  }
}
