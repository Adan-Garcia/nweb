import { BackupCard } from "@/components/settings/backup-card";
import { useWorkspaceBackup } from "@/components/settings/use-workspace-backup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useThemeMode } from "@/hooks/use-theme-mode";

export function SettingsPage() {
  const { isDark, toggleTheme } = useThemeMode();
  const { status, exportWorkspace, importWorkspace } = useWorkspaceBackup();

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
          <BackupCard
            status={status}
            onExport={() => void exportWorkspace()}
            onImport={(file) => void importWorkspace(file)}
          />

          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>
                There is no account yet. Cuervo Planner has no server, so nothing you write is
                uploaded and there is nothing to sign in to. Accounts, sync and a passphrase lock
                are planned.
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
