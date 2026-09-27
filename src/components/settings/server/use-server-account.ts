import { useCallback, useEffect, useState } from "react";

import type { AccountRecord } from "@/lib/account/account-record";
import { readAccountRecord } from "@/lib/account/account-record";
import {
  type ArrivalMode,
  type ConnectFailure,
  enrolServerAccount,
  signInToServer,
} from "@/lib/account/server-connect";
import {
  deleteServerAccountAndDisconnect,
  type DisconnectFailure,
  disconnectServer,
} from "@/lib/account/server-disconnect";
import { hasWorkspaceContent } from "@/lib/account/workspace-data";
import type { ApiSession } from "@/lib/api/client";
import {
  defaultServerUrl,
  readServerUrl,
  resetServerUrl,
  writeServerUrl,
} from "@/lib/api/server-url";
import { getApiSession } from "@/lib/api/session-store";
import { notifyLockChanged } from "@/lib/lock/workspace-lock";
import { runSyncRound, type SyncReport } from "@/lib/sync/sync-service";
import { notifySuccess } from "@/lib/toast";

/**
 * The server account, as Settings sees it: which server, and whether this device is on an
 * account there. The local account is separate (`use-local-account-settings.ts`) and always
 * present; this is the optional half.
 */
export type ServerAccountStatus = "loading" | "disconnected" | "connected";

export type { SyncReport } from "@/lib/sync/sync-service";

const CONNECT_ERRORS: Record<ConnectFailure, string> = {
  "already-connected": "This device is already on a server account. Disconnect it first.",
  locked: "Unlock this device first.",
  "wrong-passphrase": "That is not this device's passphrase.",
  "wrong-credentials": "That email and passphrase do not open an account on this server.",
  "email-taken": "That address already has an account on this server. Sign in to it instead.",
  unreachable: "The server could not be reached. Nothing on this device was changed.",
  "no-workspace": "That account has no workspace on this server yet.",
};

const DISCONNECT_ERRORS: Record<DisconnectFailure, string> = {
  "not-connected": "This device is not on a server account.",
  "wrong-passphrase": "That is not this device's passphrase.",
  unreachable: "The server could not be reached. Nothing was deleted.",
};

export function useServerAccount() {
  const [record, setRecord] = useState<AccountRecord | null>(null);
  const [status, setStatus] = useState<ServerAccountStatus>("loading");
  const [serverUrl, setServerUrlState] = useState<string | null>(() => readServerUrl());
  const [hasContent, setHasContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [lastSync, setLastSync] = useState<SyncReport | null>(null);

  const refresh = useCallback(async () => {
    const stored = await readAccountRecord();

    setRecord(stored);
    setStatus(stored ? "connected" : "disconnected");
    setHasContent(await hasWorkspaceContent());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * The session lives in `session-store`, not in this hook: the background sync needs it
   * too. Without one, the account's server — or the chosen one — is still enough to ask
   * what it offers, and not enough to reach anything behind a sign-in.
   */
  const sessionFor = useCallback((): ApiSession | null => {
    const baseUrl = record?.baseUrl ?? serverUrl;

    return getApiSession() ?? (baseUrl ? { baseUrl } : null);
  }, [record, serverUrl]);

  /** Runs one account action with the shared busy flag, error slot and refresh. */
  const run = useCallback(
    async (work: () => Promise<string | null>) => {
      setIsWorking(true);
      setError(null);

      try {
        const failure = await work();

        setError(failure);
        await refresh();
        notifyLockChanged();

        return failure === null;
      } finally {
        setIsWorking(false);
      }
    },
    [refresh],
  );

  /** Refused while on an account: the server cannot change under an account that lives on it. */
  const canChangeServer = useCallback(() => {
    if (record) {
      setError("Disconnect from the current server before choosing another.");
      return false;
    }

    return true;
  }, [record]);

  /** A new server address, or null for none. */
  const changeServer = useCallback(
    (next: string | null) => {
      if (!canChangeServer()) {
        return false;
      }

      if (!writeServerUrl(next)) {
        setError("That is not a web address a server could be at (it starts with https://).");
        return false;
      }

      setError(null);
      setServerUrlState(readServerUrl());
      return true;
    },
    [canChangeServer],
  );

  /** Back to the server this build was made for, or to none if it names none. */
  const resetServer = useCallback(() => {
    if (!canChangeServer()) {
      return false;
    }

    resetServerUrl();
    setError(null);
    setServerUrlState(readServerUrl());
    return true;
  }, [canChangeServer]);

  const createAccount = useCallback(
    (email: string, passphrase: string) =>
      run(async () => {
        if (!serverUrl) {
          return "Choose a server first.";
        }

        const outcome = await enrolServerAccount({ email, passphrase, baseUrl: serverUrl });

        return outcome.ok ? null : CONNECT_ERRORS[outcome.reason];
      }),
    [run, serverUrl],
  );

  const signIn = useCallback(
    (email: string, passphrase: string, mode: ArrivalMode) =>
      run(async () => {
        if (!serverUrl) {
          return "Choose a server first.";
        }

        const outcome = await signInToServer({ email, passphrase, baseUrl: serverUrl, mode });

        if (outcome.ok) {
          notifySuccess("Signed in", `This device now syncs with ${email}.`);
        }

        return outcome.ok ? null : CONNECT_ERRORS[outcome.reason];
      }),
    [run, serverUrl],
  );

  const disconnect = useCallback(
    (passphrase: string) =>
      run(async () => {
        const outcome = await disconnectServer(passphrase);

        return outcome.ok ? null : DISCONNECT_ERRORS[outcome.reason];
      }),
    [run],
  );

  const deleteServerAccount = useCallback(
    (passphrase: string) =>
      run(async () => {
        const outcome = await deleteServerAccountAndDisconnect(passphrase);

        if (outcome.ok) {
          notifySuccess("Server account deleted", "Your notes are still on this device.");
        }

        return outcome.ok ? null : DISCONNECT_ERRORS[outcome.reason];
      }),
    [run],
  );

  /** Rows first, then the blobs they point at, so nothing references a file that is not there. */
  const sync = useCallback(async () => {
    if (!getApiSession()?.token) {
      setError("Not connected to the server, so there is nothing to sync with.");
      return false;
    }

    setIsWorking(true);
    setError(null);

    try {
      const report = await runSyncRound();

      if (!report) {
        setError("Could not reach the server. Nothing local was changed.");
        return false;
      }

      setLastSync(report);
      notifySuccess("Synced", `${report.pushed} sent · ${report.applied} received`);

      return true;
    } finally {
      setIsWorking(false);
    }
  }, []);

  return {
    record,
    status,
    serverUrl,
    defaultServerUrl: defaultServerUrl(),
    hasContent,
    error,
    isWorking,
    lastSync,
    isConnected: status === "connected",
    changeServer,
    resetServer,
    createAccount,
    signIn,
    disconnect,
    deleteServerAccount,
    sync,
    /** The session as it stands, for anything that needs one — reminders, sharing. */
    sessionFor,
    refresh,
  };
}
