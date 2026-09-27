import { ServerConnectPanel } from "@/components/settings/server/server-connect-panel";
import { ServerConnectedPanel } from "@/components/settings/server/server-connected-panel";
import { ServerUrlField } from "@/components/settings/server/server-url-field";
import type { useServerAccount } from "@/components/settings/server/use-server-account";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ServerAccountCardProps = ReturnType<typeof useServerAccount> & {
  /** The local account's email, offered as the server account's. */
  localEmail: string;
};

/** The optional half of an account: a server that keeps devices in step and shares. */
export function ServerAccountCard(account: ServerAccountCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync server</CardTitle>
        <CardDescription>
          Optional. A server account keeps your devices in step and lets you share a course. It
          stores your notes sealed, and cannot read them.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <ServerUrlField
          key={account.serverUrl ?? "none"}
          serverUrl={account.record?.baseUrl ?? account.serverUrl}
          defaultServerUrl={account.defaultServerUrl}
          isLocked={account.isConnected}
          isDisabled={account.isWorking}
          onChange={account.changeServer}
          onReset={account.resetServer}
        />

        {account.record ? (
          <ServerConnectedPanel
            email={account.record.email}
            lastSync={account.lastSync}
            isWorking={account.isWorking}
            onSync={() => void account.sync()}
            onDisconnect={(passphrase) => void account.disconnect(passphrase)}
            onDelete={(passphrase) => void account.deleteServerAccount(passphrase)}
          />
        ) : account.status === "disconnected" && account.serverUrl ? (
          <ServerConnectPanel
            localEmail={account.localEmail}
            hasContent={account.hasContent}
            isWorking={account.isWorking}
            onCreate={(email, passphrase) => void account.createAccount(email, passphrase)}
            onSignIn={(email, passphrase, mode) => void account.signIn(email, passphrase, mode)}
          />
        ) : null}

        {account.error ? (
          <p role="alert" className="text-sm text-destructive">
            {account.error}
          </p>
        ) : null}

        <p className="text-caption text-muted-foreground">
          What the server can see: how many notes you have, who you share with, and when things are
          due — the last on purpose, so a reminder can say something is due at nine without saying
          what. What it cannot see is any of the words.
        </p>
      </CardContent>
    </Card>
  );
}
