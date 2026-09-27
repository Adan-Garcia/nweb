import { useCallback, useEffect, useState } from "react";

import type { ServerSigninValues } from "@/components/auth/signin-schema";
import { readAccountRecord } from "@/lib/account/account-record";
import { unlockDevice } from "@/lib/account/device-account";
import {
  type LocalAccount,
  readLocalAccount,
  writeLocalAccount,
} from "@/lib/account/local-account";
import {
  type ArrivalMode,
  type ConnectFailure,
  signInToServer,
} from "@/lib/account/server-connect";
import { hasWorkspaceContent } from "@/lib/account/workspace-data";
import { normalizeServerUrl, writeServerUrl } from "@/lib/api/server-url";
import {
  getWorkspaceLockState,
  notifyLockChanged,
  readLockRecord,
} from "@/lib/lock/workspace-lock";

/**
 * Where this device stands, which decides what signing in means on it:
 * - `open`: its local account is unlocked already; there is nothing to do.
 * - `locked`: it has a local account; its passphrase opens it, no network needed.
 * - `needs-setup`: it has a passphrase from before local accounts, and must add one first.
 * - `fresh`: nothing to unlock, so signing in means joining an existing server account.
 */
export type SigninState = "open" | "locked" | "needs-setup" | "fresh";

export type SigninDevice = {
  state: SigninState;
  account: LocalAccount | null;
  hasContent: boolean;
};

const SIGNIN_ERRORS: Record<ConnectFailure, string> = {
  "already-connected": "This device is already on a server account.",
  locked: "Unlock this device first.",
  "wrong-passphrase": "That is not this device's passphrase.",
  "wrong-credentials": "That email and passphrase do not open an account on this server.",
  "email-taken": "That address already has an account on this server.",
  unreachable: "The server could not be reached. Nothing on this device was changed.",
  "no-workspace": "That account has no workspace on this server yet.",
  "registration-closed": "This server only takes accounts for addresses its owner has listed.",
  "untrusted-server":
    "That server asked for weaker protection than this app allows, so your passphrase was not used with it. Check the address.",
};

async function readSigninDevice(): Promise<SigninDevice> {
  const [account, lock, record, hasContent] = await Promise.all([
    readLocalAccount(),
    readLockRecord(),
    readAccountRecord(),
    hasWorkspaceContent(),
  ]);

  if (account) {
    const state = (await getWorkspaceLockState()) === "unlocked" ? "open" : "locked";

    return { state, account, hasContent };
  }

  return { state: lock || record ? "needs-setup" : "fresh", account: null, hasContent };
}

/** Opening this device's local account, or joining a server account from a new device. */
export function useSignin() {
  const [device, setDevice] = useState<SigninDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    void readSigninDevice().then(setDevice);
  }, []);

  const unlock = useCallback(async (passphrase: string): Promise<boolean> => {
    setIsWorking(true);
    setError(null);

    try {
      const opened = await unlockDevice(passphrase);

      if (!opened) {
        setError("That passphrase does not open this device.");
        return false;
      }

      notifyLockChanged();
      return true;
    } finally {
      setIsWorking(false);
    }
  }, []);

  const signIn = useCallback(
    async (values: ServerSigninValues, mode: ArrivalMode): Promise<boolean> => {
      setIsWorking(true);
      setError(null);

      try {
        const signedIn = await signInToServer({
          email: values.email,
          passphrase: values.passphrase,
          // The schema has already refused an address this does not accept.
          baseUrl: normalizeServerUrl(values.serverUrl) ?? "",
          mode,
        });

        if (!signedIn.ok) {
          setError(SIGNIN_ERRORS[signedIn.reason]);
          return false;
        }

        writeServerUrl(values.serverUrl);
        await writeLocalAccount({ name: values.name, email: values.email });
        notifyLockChanged();
        return true;
      } finally {
        setIsWorking(false);
      }
    },
    [],
  );

  return { device, error, isWorking, unlock, signIn };
}
