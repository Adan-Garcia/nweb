import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AccountCard } from "@/components/settings/account/account-card";
import { useAccount } from "@/components/settings/account/use-account";
import { AppearanceSection } from "@/components/settings/appearance/appearance-section";
import { BackupCard } from "@/components/settings/backup/backup-card";
import { useWorkspaceBackup } from "@/components/settings/backup/use-workspace-backup";
import { LockCard } from "@/components/settings/lock/lock-card";
import { RemindersCard } from "@/components/settings/reminders/reminders-card";
import { useReminders } from "@/components/settings/reminders/use-reminders";
import { SettingsBlock } from "@/components/settings/settings-block";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SharingCard } from "@/components/settings/sharing/sharing-card";
import { useSharing } from "@/components/settings/sharing/use-sharing";
import { useSettingsAnchor } from "@/components/settings/use-settings-anchor";
import { useWorkspaceEditor } from "@/components/settings/workspace/use-workspace-editor";
import { WorkspaceEditorCard } from "@/components/settings/workspace/workspace-editor-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspaceLock } from "@/hooks/use-workspace-lock";

export function SettingsPage() {
  const activeId = useSettingsAnchor();
  const backup = useWorkspaceBackup();
  const lock = useWorkspaceLock();
  const editor = useWorkspaceEditor();
  const account = useAccount();
  const reminders = useReminders(account.sessionFor);
  const sharing = useSharing(account.sessionFor, account.record?.material.publicKey ?? null);

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        description="Appearance follows your account to every device. Everything else applies to this browser."
      />

      <div className="grid gap-6 md:grid-cols-[12rem_1fr] md:gap-10">
        <SettingsNav activeId={activeId} />

        <div className="grid min-w-0 gap-6">
          <SettingsBlock id="appearance">
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Theme, colour, spacing and the order of things.</CardDescription>
              </CardHeader>
              <CardContent>
                <AppearanceSection />
              </CardContent>
            </Card>
          </SettingsBlock>

          <SettingsBlock id="workspace">
            <WorkspaceEditorCard {...editor} />
          </SettingsBlock>

          <SettingsBlock id="security">
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
          </SettingsBlock>

          <SettingsBlock id="backup">
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
          </SettingsBlock>

          <SettingsBlock id="account">
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
          </SettingsBlock>

          <SettingsBlock id="sharing">
            <SharingCard
              isConnected={account.isConnected}
              shareable={sharing.shareable}
              shares={sharing.shares}
              selected={sharing.selected}
              error={sharing.error}
              isWorking={sharing.isWorking}
              onSelect={sharing.select}
              onShare={(keyId, email, role) => void sharing.share(keyId, email, role)}
              onRevoke={(keyId, email) => void sharing.revoke(keyId, email)}
            />
          </SettingsBlock>

          <SettingsBlock id="reminders">
            <RemindersCard
              state={reminders.state}
              isWorking={reminders.isWorking}
              onEnable={() => void reminders.enable()}
              onDisable={() => void reminders.disable()}
            />
          </SettingsBlock>
        </div>
      </div>
    </PageContainer>
  );
}
