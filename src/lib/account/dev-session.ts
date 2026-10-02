import { getWorkspaceLockState } from "../lock/workspace-lock";
import { createLocalAccount, unlockDevice } from "./device-account";
import { readLocalAccount } from "./local-account";

/**
 * Development only: the account `npm run dev:open` signs in with. It is a real local
 * account under a well-known passphrase, so everything behind it (the lock, encryption,
 * the gates) works exactly as it does for a person. Never imported outside a dev server;
 * see `main.tsx`.
 */
export const DEV_SESSION_ACCOUNT = {
  name: "Dev",
  email: "dev@example.com",
  passphrase: "dev session passphrase",
} as const;

export type DevSessionOutcome = "created" | "unlocked" | "already-open" | "not-ours";

/**
 * Makes the dev account on a device that has none, or unlocks it on one that has. A device
 * with someone else's account is left alone, locked: the passphrase will not open it, and
 * nothing here would overwrite it.
 */
export async function startDevSession(): Promise<DevSessionOutcome> {
  if (!(await readLocalAccount())) {
    const created = await createLocalAccount(DEV_SESSION_ACCOUNT);

    return created.ok ? "created" : "not-ours";
  }

  if ((await getWorkspaceLockState()) !== "locked") {
    return "already-open";
  }

  return (await unlockDevice(DEV_SESSION_ACCOUNT.passphrase)) ? "unlocked" : "not-ours";
}
