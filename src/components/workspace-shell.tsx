import * as React from "react";

import { LockScreen } from "@/components/lock-screen";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
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
   * Housekeeping, once a load: tombstones past the retention window are dropped. It runs
   * here rather than at startup because the workspace is what has them, and only after
   * the lock is open — a sweep reads no names, but there is no reason for it to race the
   * unlock either.
   */
  React.useEffect(() => {
    if (lock.state !== "locked") {
      void collectTombstonesOnce();
    }
  }, [lock.state]);

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
