import { useCallback, useState } from "react";

import { eraseDevice, verifyDevicePassphrase } from "@/lib/account/device-account";
import { type LocalAccountProfile, writeLocalAccount } from "@/lib/account/local-account";
import { deleteServerAccountAndDisconnect } from "@/lib/account/server-disconnect";
import { notifySuccess } from "@/lib/toast";

/**
 * The local account's own settings: who it is, and forgetting the device entirely.
 * The passphrase lives with the lock (`useWorkspaceLock`), which already runs its rewrite.
 */
export function useLocalAccountSettings(options: {
  refresh: () => Promise<unknown>;
  /** Where to go once the device is erased; a full load, so nothing stale survives. */
  onErased: () => void;
}) {
  const { refresh, onErased } = options;
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const saveProfile = useCallback(
    async (profile: LocalAccountProfile) => {
      setError(null);

      try {
        await writeLocalAccount(profile);
        await refresh();
        notifySuccess("Account updated");
        return true;
      } catch {
        setError("That name or email is not one this account can take.");
        return false;
      }
    },
    [refresh],
  );

  /**
   * Erases every note, key and setting on this device. With `alsoServer`, the server
   * account goes first — and if it cannot, nothing here is erased, so the notes are not
   * lost while the server copy lingers.
   */
  const erase = useCallback(
    async (passphrase: string, alsoServer: boolean) => {
      setIsWorking(true);
      setError(null);

      try {
        if (!(await verifyDevicePassphrase(passphrase))) {
          setError("That is not this device's passphrase. Nothing was erased.");
          return false;
        }

        if (alsoServer) {
          const deleted = await deleteServerAccountAndDisconnect(passphrase);

          if (!deleted.ok) {
            setError("The server account could not be deleted, so nothing was erased.");
            return false;
          }
        }

        await eraseDevice();
        onErased();
        return true;
      } finally {
        setIsWorking(false);
      }
    },
    [onErased],
  );

  return { error, isWorking, saveProfile, erase };
}
