import { useCallback, useEffect, useState } from "react";

import { type LocalAccount, readLocalAccount } from "@/lib/account/local-account";

export type LocalAccountStatus = "loading" | "none" | "ready";

/**
 * Whether this device has its local account yet, and who it is. The workspace shell gates
 * on it, the auth pages branch on it, and Settings edits it.
 */
export function useLocalAccount() {
  const [account, setAccount] = useState<LocalAccount | null>(null);
  const [status, setStatus] = useState<LocalAccountStatus>("loading");

  const show = useCallback((stored: LocalAccount | null) => {
    setAccount(stored);
    setStatus(stored ? "ready" : "none");

    return stored;
  }, []);

  const refresh = useCallback(async () => show(await readLocalAccount()), [show]);

  useEffect(() => {
    void readLocalAccount().then(show);
  }, [show]);

  return { account, status, refresh };
}
