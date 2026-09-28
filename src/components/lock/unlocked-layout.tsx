import { Suspense } from "react";
import { Outlet } from "react-router-dom";

import { RouteFallback } from "@/components/layout/route-fallback";
import { WorkspaceLockGate } from "@/components/lock/workspace-lock-gate";
import { RequireLocalAccount } from "@/components/shell/require-local-account";
import { useLocalAccount } from "@/hooks/use-local-account";
import { useWorkspaceLock } from "@/hooks/use-workspace-lock";

/**
 * For a full-screen page that reads the workspace without being part of its frame — the
 * onboarding. It asks for the same two things the workspace does, a local account and an
 * unlocked device, so a reload halfway through setting up lands on the lock screen rather
 * than on storage that refuses every read.
 */
export function UnlockedLayout() {
  const lock = useWorkspaceLock();
  const { account } = useLocalAccount();

  return (
    <RequireLocalAccount>
      <WorkspaceLockGate lock={lock} name={account?.name ?? null}>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </WorkspaceLockGate>
    </RequireLocalAccount>
  );
}
