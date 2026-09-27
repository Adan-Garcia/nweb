import * as React from "react";

import { CommandPalette } from "@/components/command-palette/command-palette";
import { LockScreen } from "@/components/lock/lock-screen";
import { RekeyResumeScreen } from "@/components/lock/rekey-resume-screen";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { ReminderPrompt } from "@/components/shell/reminder-prompt";
import { WorkspaceSidebar } from "@/components/shell/workspace-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppearance } from "@/hooks/use-appearance";
import { useBackgroundSync } from "@/hooks/use-background-sync";
import { useFeedRefresh } from "@/hooks/use-feed-refresh";
import { useLocalAccount } from "@/hooks/use-local-account";
import { useWorkspaceLock } from "@/hooks/use-workspace-lock";
import { collectTombstonesOnce } from "@/lib/db/tombstones";

type WorkspaceShellProps = {
  children: React.ReactNode;
};

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  const { preferences, update } = useAppearance();
  const lock = useWorkspaceLock();
  const { account } = useLocalAccount();

  /**
   * Housekeeping, once a load: tombstones past the retention window are dropped.
   *
   * Only when the workspace is actually usable. A locked one has nothing to sweep for yet,
   * and a half-rekeyed one is being walked row by row by the resume — deleting rows out
   * from under that is a race with nothing to gain.
   */
  const isUsable = lock.state === "unlocked" || lock.state === "unset";

  React.useEffect(() => {
    if (isUsable) {
      void collectTombstonesOnce();
    }
  }, [isUsable]);

  // Runs for as long as the workspace is open, and does nothing until there is a session.
  useBackgroundSync(isUsable);

  // Subscribed calendars, fetched again as each falls due.
  useFeedRefresh(isUsable);

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
    return (
      <LockScreen
        name={account?.name ?? null}
        error={lock.error}
        isWorking={lock.isWorking}
        onUnlock={(passphrase) => void lock.unlock(passphrase)}
      />
    );
  }

  return (
    <TooltipProvider>
      <SidebarProvider
        open={preferences.sidebar === "expanded"}
        onOpenChange={(isOpen) => update({ sidebar: isOpen ? "expanded" : "icons" })}
      >
        <WorkspaceSidebar />
        <SidebarInset className="min-w-0 bg-background pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </SidebarInset>
        <MobileTabBar />
        <ReminderPrompt />
        <CommandPalette canLock={lock.state === "unlocked"} onLock={() => void lock.lock()} />
      </SidebarProvider>
    </TooltipProvider>
  );
}
