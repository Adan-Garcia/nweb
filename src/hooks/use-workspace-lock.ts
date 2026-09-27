import { useCallback, useEffect, useState } from "react";

import { changeDevicePassphrase, unlockDevice } from "@/lib/account/device-account";
import { passphrasesNeeded, readRekeyJournal } from "@/lib/lock/rekey-journal";
import {
  getWorkspaceLockState,
  lockWorkspace,
  notifyLockChanged,
  readLockHint,
  subscribeToLockChanges,
} from "@/lib/lock/workspace-lock";
import type { WorkspaceLockState } from "@/lib/lock/workspace-lock-model";
import { resumeRekey } from "@/lib/lock/workspace-passphrase";
import type { RekeyProgress } from "@/lib/lock/workspace-rekey";

/**
 * The lock, as the UI sees it.
 *
 * The first value comes from the synchronous hint, so a locked workspace paints its lock
 * screen immediately and an unlocked one never blanks. The database is then read and the
 * state corrected, which matters when the hint is stale — cleared site data, or another
 * tab that removed the passphrase.
 */
export function useWorkspaceLock() {
  const [state, setState] = useState<WorkspaceLockState>(() =>
    readLockHint() ? "locked" : "unset",
  );
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  /** Rows converted out of rows to convert, while a rekey is running. Null when none is. */
  const [progress, setProgress] = useState<RekeyProgress | null>(null);
  /** Which passphrases an interrupted rekey still needs, so the screen can ask for them. */
  const [needed, setNeeded] = useState<("source" | "target")[]>([]);

  const refresh = useCallback(async () => {
    const next = await getWorkspaceLockState();
    setState(next);

    const journal = next === "interrupted" ? await readRekeyJournal() : null;
    setNeeded(journal ? passphrasesNeeded(journal) : []);
  }, []);

  useEffect(() => {
    void refresh();

    return subscribeToLockChanges(() => {
      void refresh();
    });
  }, [refresh]);

  /**
   * Wraps a rekey: it is the one thing here that is not instant, so it reports how far it
   * has got and clears that report however it ends.
   */
  const runRekey = useCallback(
    async (work: (onProgress: (next: RekeyProgress) => void) => Promise<boolean>) => {
      setIsWorking(true);
      setError(null);
      setProgress({ done: 0, total: 0 });

      try {
        return await work(setProgress);
      } finally {
        setProgress(null);
        setIsWorking(false);
        await refresh();
      }
    },
    [refresh],
  );

  /**
   * The device's passphrase, whichever key it opens: the account's on a device with a
   * server account, the lock's otherwise (`device-account.ts`).
   */
  const unlock = useCallback(
    async (passphrase: string) => {
      setIsWorking(true);
      setError(null);

      try {
        if (await unlockDevice(passphrase)) {
          // Other readers of the lock hear about it; this one reads it before returning.
          notifyLockChanged();
          await refresh();
          return true;
        }

        setError("That passphrase does not unlock this workspace.");
        return false;
      } finally {
        setIsWorking(false);
      }
    },
    [refresh],
  );

  const lock = useCallback(async () => {
    lockWorkspace();
    await refresh();
  }, [refresh]);

  /**
   * A new passphrase. On a local-only device every row is rewritten, which is why it goes
   * through the rekey runner; on a server account it is one key and a call to the server.
   */
  const change = useCallback(
    (currentPassphrase: string, nextPassphrase: string) =>
      runRekey(async (onProgress) => {
        const changed = await changeDevicePassphrase(currentPassphrase, nextPassphrase, onProgress);

        if (!changed.ok) {
          setError(CHANGE_ERRORS[changed.reason]);
        }

        return changed.ok;
      }),
    [runRekey],
  );

  /** Finishes a rekey that was interrupted. Nothing else is reachable until it succeeds. */
  const resume = useCallback(
    (passphrases: { source?: string; target?: string }) =>
      runRekey(async (onProgress) => {
        try {
          if (await resumeRekey(passphrases, onProgress)) {
            return true;
          }

          setError("That is not the passphrase this workspace was being moved between.");
          return false;
        } catch {
          setError("Could not finish the change. Nothing was lost; try again.");
          return false;
        }
      }),
    [runRekey],
  );

  return {
    state,
    error,
    isWorking,
    progress,
    needed,
    unlock,
    lock,
    change,
    resume,
    refresh,
  };
}

const CHANGE_ERRORS = {
  "wrong-passphrase": "That passphrase is not the one this device is locked with.",
  unreachable:
    "Changing the passphrase of a synced account needs the server, and it could not be reached. Nothing was changed.",
  failed: "Could not change the passphrase. The old one still opens this workspace.",
} as const;
