import { BackupCard } from "@/components/settings/backup-card";
import { LockCard } from "@/components/settings/lock-card";
import { useWorkspaceBackup } from "@/components/settings/use-workspace-backup";
import { useWorkspaceEditor } from "@/components/settings/use-workspace-editor";
import { WorkspaceEditorCard } from "@/components/settings/workspace-editor-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { useWorkspaceLock } from "@/hooks/use-workspace-lock";

export function SettingsPage() {
  const { isDark, toggleTheme } = useThemeMode();
  const backup = useWorkspaceBackup();
  const lock = useWorkspaceLock();
  const editor = useWorkspaceEditor();

  return (
    <WorkspaceShell isDark={isDark} onToggleTheme={toggleTheme}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-4xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Everything here applies to this browser on this device.
          </p>
        </div>

        <div className="grid gap-6">
          <LockCard
            state={lock.state}
            error={lock.error}
            isWorking={lock.isWorking}
            progress={lock.progress}
            onCreate={(passphrase) => void lock.create(passphrase)}
            onChange={(current, next) => void lock.change(current, next)}
            onRemove={(passphrase) => void lock.remove(passphrase)}
            onLock={() => void lock.lock()}
          />

          <WorkspaceEditorCard {...editor} />

          <BackupCard
            status={backup.status}
            needsPassphrase={backup.needsPassphrase}
            isLockSet={lock.state !== "unset"}
            restoreMode={backup.restoreMode}
            onChooseRestoreMode={backup.chooseRestoreMode}
            onExport={(passphrase) => void backup.exportWorkspace(passphrase)}
            onImport={(file) => void backup.importWorkspace(file)}
            onUnlock={(passphrase) => void backup.unlockImport(passphrase)}
            onCancelUnlock={backup.cancelImport}
          />

          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>
                There is no account yet. Cuervo Planner has no server, so nothing you write is
                uploaded and there is nothing to sign in to. The workspace lock above is a lock on
                this browser, not an account. Accounts and sync are planned.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="m-0 text-sm text-muted-foreground">
                See the{" "}
                <a href="/documentation" className="text-primary hover:underline">
                  documentation page
                </a>{" "}
                for what is built and what is planned.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </WorkspaceShell>
  );
}
