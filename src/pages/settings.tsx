import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AccountSection } from "@/components/settings/account/account-section";
import { AppearanceSection } from "@/components/settings/appearance/appearance-section";
import { BackupCard } from "@/components/settings/backup/backup-card";
import { useWorkspaceBackup } from "@/components/settings/backup/use-workspace-backup";
import { FeedEditor } from "@/components/settings/feeds/feed-editor";
import { FeedsCard } from "@/components/settings/feeds/feeds-card";
import { useCalendarFeeds } from "@/components/settings/feeds/use-calendar-feeds";
import { useFeedEditor } from "@/components/settings/feeds/use-feed-editor";
import { RemindersCard } from "@/components/settings/reminders/reminders-card";
import { useReminders } from "@/components/settings/reminders/use-reminders";
import { ServerAccountCard } from "@/components/settings/server/server-account-card";
import { useServerAccount } from "@/components/settings/server/use-server-account";
import { SettingsBlock } from "@/components/settings/settings-block";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SharingCard } from "@/components/settings/sharing/sharing-card";
import { useSharing } from "@/components/settings/sharing/use-sharing";
import { useSettingsAnchor } from "@/components/settings/use-settings-anchor";
import { useWorkspaceEditor } from "@/components/settings/workspace/use-workspace-editor";
import { WorkspaceEditorCard } from "@/components/settings/workspace/workspace-editor-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocalAccount } from "@/hooks/use-local-account";

export function SettingsPage() {
  const activeId = useSettingsAnchor();
  const backup = useWorkspaceBackup();
  const editor = useWorkspaceEditor();
  const account = useServerAccount();
  const local = useLocalAccount();
  const reminders = useReminders(account.sessionFor);
  const sharing = useSharing(account.sessionFor, account.record?.material.publicKey ?? null);
  const feeds = useCalendarFeeds();
  const feedEditor = useFeedEditor({ onSaved: feeds.afterSave });

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        description="Appearance follows your sync account to every device. Everything else applies to this device."
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

          <SettingsBlock id="account">
            <AccountSection
              isServerConnected={account.isConnected}
              // A full load, so nothing held in memory outlives the erased device.
              onErased={() => window.location.assign("/auth/signup")}
            />
          </SettingsBlock>

          <SettingsBlock id="sync">
            <ServerAccountCard {...account} localEmail={local.account?.email ?? ""} />
          </SettingsBlock>

          <SettingsBlock id="workspace">
            <WorkspaceEditorCard {...editor} />
          </SettingsBlock>

          <SettingsBlock id="feeds">
            <FeedsCard
              feeds={feeds.feeds}
              isLoading={feeds.isLoading}
              busyFeedId={feeds.busyFeedId}
              onAdd={() => feedEditor.open(null)}
              onEdit={feedEditor.open}
              onRefresh={(feed) => void feeds.refresh(feed)}
              onRemove={(feed, removeTasks) => void feeds.remove(feed, removeTasks)}
            />
            <FeedEditor editor={feedEditor} branchOptions={feeds.branchOptions} />
          </SettingsBlock>

          <SettingsBlock id="backup">
            <BackupCard
              status={backup.status}
              needsPassphrase={backup.needsPassphrase}
              isLockSet
              restoreMode={backup.restoreMode}
              onChooseRestoreMode={backup.chooseRestoreMode}
              onExport={(passphrase) => void backup.exportWorkspace(passphrase)}
              onImport={(file) => void backup.importWorkspace(file)}
              onUnlock={(passphrase) => void backup.unlockImport(passphrase)}
              onCancelUnlock={backup.cancelImport}
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
