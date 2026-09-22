import * as React from "react";

import { LockScreen } from "@/components/lock-screen";
import { RekeyResumeScreen } from "@/components/rekey-resume-screen";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { useBackgroundSync } from "@/hooks/use-background-sync";
import { useWorkspaceLock } from "@/hooks/use-workspace-lock";
import { collectTombstonesOnce } from "@/lib/tombstones";

type WorkspaceShellProps = {
  children: React.ReactNode;
  isDark: boolean;
  onToggleTheme: () => void;
};

export function WorkspaceShell({ children, isDark, onToggleTheme }: WorkspaceShellProps) {
  const lock = useWorkspaceLock();

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
        error={lock.error}
        isWorking={lock.isWorking}
        onUnlock={(passphrase) => void lock.unlock(passphrase)}
      />
    );
  }

  return (
    <SidebarProvider>
      <WorkspaceSidebar isDark={isDark} onToggleTheme={onToggleTheme} />
      <SidebarInset>
        <div className="min-h-svh bg-background text-foreground">
          <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur md:hidden sm:px-6 lg:px-8">
            <SidebarTrigger />
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
                Workspace
              </p>
            </div>
          </div>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
