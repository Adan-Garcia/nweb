import type { ReactNode } from "react";

import { RouteFallback } from "@/components/layout/route-fallback";
import { LockScreen } from "@/components/lock/lock-screen";
import { RekeyResumeScreen } from "@/components/lock/rekey-resume-screen";
import type { useWorkspaceLock } from "@/hooks/use-workspace-lock";

type WorkspaceLockGateProps = {
  lock: ReturnType<typeof useWorkspaceLock>;
  /** Whose device this is, for the lock screen's greeting. */
  name: string | null;
  children: ReactNode;
};

/**
 * What stands in front of anything that reads the workspace: the screen that finishes an
 * interrupted rekey, the lock screen, or — while a remembered sign-in is being tried — a
 * wait rather than a lock screen that flashes up and away.
 */
export function WorkspaceLockGate({ lock, name, children }: WorkspaceLockGateProps) {
  // Checked before the lock screen: a half-converted workspace cannot be unlocked, only
  // finished, and offering a passphrase box that cannot work would be a dead end.
  if (lock.state === "interrupted") {
    return (
      <RekeyResumeScreen
        needed={lock.needed}
        error={lock.error}
        isWorking={lock.isWorking}
        progress={lock.progress}
        onResume={(passphrases) => void lock.resume(passphrases)}
      />
    );
  }

  if (lock.state === "locked") {
    if (lock.isChecking) {
      return <RouteFallback />;
    }

    return (
      <LockScreen
        name={name}
        error={lock.error}
        isWorking={lock.isWorking}
        onUnlock={(passphrase, remember) => void lock.unlock(passphrase, remember)}
      />
    );
  }

  return children;
}
