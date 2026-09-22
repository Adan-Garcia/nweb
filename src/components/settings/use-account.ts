import { useCallback, useEffect, useState } from "react";

import type { AccountRecord } from "@/lib/account/account-record";
import { readAccountRecord } from "@/lib/account/account-record";
import { adoptAccount, forgetAccount, unlockAccount } from "@/lib/account/adopt-account";
import { deriveAuthKey } from "@/lib/account-keys";
import {
  apiBaseUrl,
  endSession,
  fetchKeyGraph,
  openSession,
  putKeys,
  registerAccount,
} from "@/lib/api/account-api";
import type { ApiSession } from "@/lib/api/client";
import { getApiSession, setApiSession } from "@/lib/api/session-store";
import { registerCipher } from "@/lib/cipher";
import { cipherForKey, openKeyGraph } from "@/lib/keys/key-graph";
import { resetSyncState, runSyncRound, type SyncReport } from "@/lib/sync/sync-service";

/**
 * The account, as the settings screen sees it.
 *
 * Signing in is two separate things that happen to share a passphrase. Opening the
 * workspace is local and needs no network at all — the keys are on disk, sealed. Opening a
 * *session* is what lets rows travel. A device with no signal does the first and skips the
 * second, and everything except sync keeps working.
 */
export type AccountStatus = "loading" | "none" | "locked" | "ready";

export type { SyncReport } from "@/lib/sync/sync-service";

export function useAccount() {
  const [record, setRecord] = useState<AccountRecord | null>(null);
  const [status, setStatus] = useState<AccountStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [lastSync, setLastSync] = useState<SyncReport | null>(null);

  const baseUrl = apiBaseUrl();

  const refresh = useCallback(async () => {
    const stored = await readAccountRecord();

    setRecord(stored);
    setStatus(stored ? "locked" : "none");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * The session lives in `session-store`, not in this hook: a background sync loop needs it
   * too, and a token held in a component would be gone the moment the settings page is.
   * Without one, a base URL alone is still a session — enough to ask what this deployment
   * offers, and not enough to reach anything behind a sign-in.
   */
  const sessionFor = useCallback(
    (): ApiSession | null => getApiSession() ?? (baseUrl ? { baseUrl } : null),
    [baseUrl],
  );

  /**
   * Adopts everything this device already holds. The rows are rewritten once, here, onto a
   * key of the workspace's own — see `adopt-account.ts` for why that indirection is worth it.
   */
  const createAccount = useCallback(
    async (email: string, passphrase: string, currentPassphrase?: string) => {
      if (!baseUrl) {
        setError("This build has no server configured, so there is nothing to sign up to.");
        return false;
      }

      setIsWorking(true);
      setError(null);

      try {
        const outcome = await adoptAccount({
          email,
          baseUrl,
          passphrase,
          currentPassphrase,
          enrol: async (request) => {
            const registered = await registerAccount(
              { baseUrl },
              { email: request.email, authKey: request.authKey, material: request.material },
            );

            if (!registered.ok) {
              return false;
            }

            const session = await openSession({ baseUrl }, email, request.authKey);

            if (!session.ok) {
              return false;
            }

            setApiSession({ baseUrl, token: session.value.token });

            // The wing key is recorded before a row moves, so a rewrite that dies partway
            // leaves rows that are still openable by an account that exists.
            const recorded = await putKeys(
              { baseUrl, token: session.value.token },
              {
                keys: [{ id: request.wingKeyId, kind: "wing", rotatedFrom: null }],
                wraps: [],
                grants: [{ keyId: request.wingKeyId, role: "writer", wrapped: request.grant }],
              },
            );

            return recorded.ok;
          },
        });

        if (!outcome.ok) {
          setError(REASONS[outcome.reason]);
          return false;
        }

        setRecord(outcome.record);
        setStatus("ready");
        return true;
      } finally {
        setIsWorking(false);
      }
    },
    [baseUrl],
  );

  /** Opens the workspace from the passphrase, then a session if there is a server to reach. */
  const signIn = useCallback(
    async (passphrase: string) => {
      setIsWorking(true);
      setError(null);

      try {
        const opened = await unlockAccount(passphrase);

        if (!opened.ok) {
          setError(
            opened.reason === "no-account"
              ? "This device is not signed in to an account."
              : "That passphrase does not open this account.",
          );
          return false;
        }

        setStatus("ready");

        const stored = await readAccountRecord();

        if (baseUrl && stored) {
          const session = await openSession(
            { baseUrl },
            stored.email,
            await deriveAuthKey(passphrase, stored.material.kdf),
          );

          // A failed session is not a failed sign-in: the notes are already open, and the
          // only thing missing is the part that needs a network.
          if (session.ok) {
            setApiSession({ baseUrl, token: session.value.token });
            await adoptGraph({ baseUrl, token: session.value.token }, opened.keys.privateKey);
          }
        }

        return true;
      } finally {
        setIsWorking(false);
      }
    },
    [baseUrl],
  );

  const signOut = useCallback(async () => {
    const session = sessionFor();

    if (session?.token) {
      await endSession(session);
    }

    setApiSession(null);
    resetSyncState();
    await forgetAccount();
    await refresh();
  }, [refresh, sessionFor]);

  /** Rows first, then the blobs they point at, so nothing references a file that is not there. */
  const sync = useCallback(async () => {
    const session = sessionFor();

    if (!session?.token) {
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

      return true;
    } finally {
      setIsWorking(false);
    }
  }, [sessionFor]);

  return {
    record,
    status,
    error,
    isWorking,
    lastSync,
    setLastSync,
    hasServer: Boolean(baseUrl),
    isConnected: Boolean(record) && status === "ready",
    createAccount,
    signIn,
    signOut,
    sync,
    /** The session as it stands, for anything that needs one — reminders, sharing. */
    sessionFor,
    refresh,
  };
}

const REASONS: Record<"already-adopted" | "wrong-passphrase" | "enrolment-refused", string> = {
  "already-adopted": "This device is already signed in. Sign out before joining another account.",
  "wrong-passphrase": "That is not the passphrase this workspace is locked with.",
  "enrolment-refused":
    "The server would not take that address. Nothing on this device was changed.",
};

/**
 * Walks the key graph the server hands over and registers everything it yields, so a course
 * somebody shared opens beside this workspace's own notes. A graph that will not fetch is
 * not an error worth reporting: the workspace's own key is already in hand.
 */
async function adoptGraph(session: ApiSession, privateKey: CryptoKey): Promise<void> {
  const graph = await fetchKeyGraph(session);

  if (!graph.ok) {
    return;
  }

  const keyring = await openKeyGraph(graph.value, privateKey);

  for (const keyId of keyring.keys()) {
    const cipher = cipherForKey(keyring, keyId);

    if (cipher) {
      registerCipher(cipher);
    }
  }
}
