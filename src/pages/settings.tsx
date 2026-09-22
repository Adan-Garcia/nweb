import { AccountCard } from "@/components/settings/account-card";
import { BackupCard } from "@/components/settings/backup-card";
import { LockCard } from "@/components/settings/lock-card";
import { useAccount } from "@/components/settings/use-account";
import { useWorkspaceBackup } from "@/components/settings/use-workspace-backup";
import { useWorkspaceEditor } from "@/components/settings/use-workspace-editor";
import { WorkspaceEditorCard } from "@/components/settings/workspace-editor-card";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { useWorkspaceLock } from "@/hooks/use-workspace-lock";

export function SettingsPage() {
  const { isDark, toggleTheme } = useThemeMode();
  const backup = useWorkspaceBackup();
  const lock = useWorkspaceLock();
  const editor = useWorkspaceEditor();
  const account = useAccount();

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

          <AccountCard
            status={account.status}
            email={account.record?.email ?? null}
            hasServer={account.hasServer}
            isWorking={account.isWorking}
            isLockSet={lock.state !== "unset"}
            error={account.error}
            lastSync={account.lastSync}
            onCreate={(email, passphrase, current) =>
              void account.createAccount(email, passphrase, current)
            }
            onSignIn={(passphrase) => void account.signIn(passphrase)}
            onSignOut={() => void account.signOut()}
            onSync={() => void account.sync()}
          />
        </div>
      </div>
    </WorkspaceShell>
  );
}
