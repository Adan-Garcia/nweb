import { useCallback, useEffect, useState } from "react";

import {
  createWorkspaceLock,
  getWorkspaceLockState,
  lockWorkspace,
  readLockHint,
  removeWorkspaceLock,
  unlockWorkspace,
} from "@/lib/workspace-lock";
import type { WorkspaceLockState } from "@/lib/workspace-lock-model";

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

  const refresh = useCallback(async () => {
    setState(await getWorkspaceLockState());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    async (passphrase: string) => {
      setIsWorking(true);
      setError(null);

      try {
        await createWorkspaceLock(passphrase);
        await refresh();
        return true;
      } catch {
        setError("Could not set the passphrase. Nothing was changed.");
        return false;
      } finally {
        setIsWorking(false);
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (passphrase: string) => {
      setIsWorking(true);
      setError(null);

      try {
        if (await removeWorkspaceLock(passphrase)) {
          await refresh();
          return true;
        }

        setError("That passphrase is not the one this workspace was locked with.");
        return false;
      } finally {
        setIsWorking(false);
      }
    },
    [refresh],
  );

  return { state, error, isWorking, unlock, lock, create, remove, refresh };
}
