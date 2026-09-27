import { useCallback, useEffect, useState } from "react";

import type { SignupValues } from "@/components/auth/signup-schema";
import { readAccountRecord } from "@/lib/account/account-record";
import { createLocalAccount } from "@/lib/account/device-account";
import { readLocalAccount } from "@/lib/account/local-account";
import { enrolServerAccount } from "@/lib/account/server-connect";
import { normalizeServerUrl, writeServerUrl } from "@/lib/api/server-url";
import { readLockRecord } from "@/lib/lock/workspace-lock";
import type { RekeyProgress } from "@/lib/lock/workspace-rekey";

/** What this device already has, which decides what the form asks. */
export type SignupDevice = { hasLocalAccount: boolean; hasPassphrase: boolean };

export type SignupOutcome = "done" | "local-only" | "failed";

const SERVER_ERRORS: Record<string, string> = {
  "email-taken": "that address already has an account there — sign in to it from Settings",
  unreachable: "the server could not be reached",
  "registration-closed": "that server only takes accounts for addresses its owner has listed",
};

/**
 * Setting up the local account, and optionally a server account in the same breath.
 *
 * The local account comes first and stands on its own: a server that refuses, or is not
 * there, leaves a working device and a message, never a half-made account.
 */
export function useSignup() {
  const [device, setDevice] = useState<SignupDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<RekeyProgress | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    void Promise.all([readLocalAccount(), readLockRecord(), readAccountRecord()]).then(
      ([local, lock, account]) => {
        setDevice({ hasLocalAccount: Boolean(local), hasPassphrase: Boolean(lock ?? account) });
      },
    );
  }, []);

  const submit = useCallback(async (values: SignupValues): Promise<SignupOutcome> => {
    setIsWorking(true);
    setError(null);

    try {
      const created = await createLocalAccount(
        { name: values.name, email: values.email, passphrase: values.passphrase },
        setProgress,
      );

      if (!created.ok) {
        setError(
          created.reason === "exists"
            ? "This device already has an account. Sign in instead."
            : "That is not the passphrase this device is locked with.",
        );
        return "failed";
      }

      if (!values.withServer) {
        return "done";
      }

      writeServerUrl(values.serverUrl);

      const enrolled = await enrolServerAccount({
        email: values.email,
        passphrase: values.passphrase,
        // The schema has already refused an address this does not accept.
        baseUrl: normalizeServerUrl(values.serverUrl) ?? "",
      });

      if (enrolled.ok) {
        return "done";
      }

      setError(
        `Your account is ready on this device, but the sync account was not created: ${
          SERVER_ERRORS[enrolled.reason] ?? "the server refused it"
        }. You can connect later in Settings.`,
      );
      return "local-only";
    } finally {
      setProgress(null);
      setIsWorking(false);
    }
  }, []);

  return { device, error, progress, isWorking, submit };
}
