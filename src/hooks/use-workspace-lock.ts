import { useCallback, useEffect, useState } from "react";

import { passphrasesNeeded, readRekeyJournal } from "@/lib/rekey-journal";
import {
  getWorkspaceLockState,
  lockWorkspace,
  readLockHint,
  unlockWorkspace,
} from "@/lib/workspace-lock";
import type { WorkspaceLockState } from "@/lib/workspace-lock-model";
import {
  changeWorkspacePassphrase,
  createWorkspaceLock,
  removeWorkspaceLock,
  resumeRekey,
} from "@/lib/workspace-passphrase";
import type { RekeyProgress } from "@/lib/workspace-rekey";

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

  const unlock = useCallback(
    async (passphrase: string) => {
      setIsWorking(true);
      setError(null);

      try {
        if (await unlockWorkspace(passphrase)) {
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

  /** Encrypts everything already stored, so this can take a moment on a full workspace. */
  const create = useCallback(
    (passphrase: string) =>
      runRekey(async (onProgress) => {
        try {
          await createWorkspaceLock(passphrase, onProgress);
          return true;
        } catch {
          setError("Could not set the passphrase. Nothing was changed.");
          return false;
        }
      }),
    [runRekey],
  );

  /** One pass from the old key to the new one, so nothing is readable in between. */
  const change = useCallback(
    (currentPassphrase: string, nextPassphrase: string) =>
      runRekey(async (onProgress) => {
        try {
          if (await changeWorkspacePassphrase(currentPassphrase, nextPassphrase, onProgress)) {
            return true;
          }

          setError("That passphrase is not the one this workspace is locked with.");
          return false;
        } catch {
          setError("Could not change the passphrase. The old one still opens this workspace.");
          return false;
        }
      }),
    [runRekey],
  );

  const remove = useCallback(
    (passphrase: string) =>
      runRekey(async (onProgress) => {
        if (await removeWorkspaceLock(passphrase, onProgress)) {
          return true;
        }

        setError("That passphrase is not the one this workspace was locked with.");
        return false;
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
    create,
    change,
    remove,
    resume,
    refresh,
  };
}
