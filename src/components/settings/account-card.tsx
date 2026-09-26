import { useState } from "react";

import { AccountJoinForm } from "@/components/settings/account-join-form";
import { BackupPassphraseField } from "@/components/settings/backup-passphrase-field";
import type { AccountStatus, SyncReport } from "@/components/settings/use-account";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AccountCardProps = {
  status: AccountStatus;
  email: string | null;
  hasServer: boolean;
  isWorking: boolean;
  isLockSet: boolean;
  error: string | null;
  lastSync: SyncReport | null;
  onCreate: (email: string, passphrase: string, currentPassphrase?: string) => void;
  onSignIn: (passphrase: string) => void;
  onSignOut: () => void;
  onSync: () => void;
};

/**
 * An account is how notes travel, not how they are read.
 *
 * That distinction is the whole card. Signing in opens the workspace from the passphrase
 * alone, on this device, with no network; a session on top of that is what lets rows reach
 * another device. Saying so plainly is the difference between this and the sort of account
 * that holds your data hostage.
 */
export function AccountCard({
  status,
  email,
  hasServer,
  isWorking,
  isLockSet,
  error,
  lastSync,
  onCreate,
  onSignIn,
  onSignOut,
  onSync,
}: AccountCardProps) {
  const [isJoining, setIsJoining] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>
          {hasServer
            ? "An account is what lets this workspace reach another device. The server stores what it cannot read: your notes, their titles and their files go up sealed, and the key never leaves here."
            : "This build has no server configured, so there is nothing to sign in to and nothing is uploaded. The workspace lock above is a lock on this browser."}
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        {hasServer && status === "none" ? (
          isJoining ? (
            <AccountJoinForm
              needsCurrentPassphrase={isLockSet}
              isDisabled={isWorking}
              onSubmit={(address, passphrase, current) => {
                onCreate(address, passphrase, current);
                setIsJoining(false);
              }}
              onCancel={() => {
                setIsJoining(false);
              }}
            />
          ) : (
            <div>
              <Button
                type="button"
                size="sm"
                disabled={isWorking}
                onClick={() => {
                  setIsJoining(true);
                }}
              >
                Create an account
              </Button>
            </div>
          )
        ) : null}

        {status === "locked" ? (
          <BackupPassphraseField
            id="account-sign-in"
            label={`Passphrase for ${email ?? "this account"}`}
            hint="Opened on this device, from the passphrase alone. No network is needed to read your own notes."
            submitLabel="Open this workspace"
            isDisabled={isWorking}
            onSubmit={onSignIn}
          />
        ) : null}

        {status === "ready" ? (
          <div className="grid gap-3">
            <p className="m-0 text-sm">
              Signed in as <strong>{email}</strong>.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={isWorking} onClick={onSync}>
                Sync now
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isWorking}
                onClick={onSignOut}
              >
                Sign out
              </Button>
            </div>
            {lastSync ? (
              <p className="m-0 text-sm text-muted-foreground">
                Sent {lastSync.pushed}, received {lastSync.applied}, and {lastSync.media} file
                {lastSync.media === 1 ? "" : "s"}.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <p className="m-0 text-sm text-muted-foreground">
          What the server can see: how many notes you have, which courses they sit in, who you share
          with, and when things are due — the last of those on purpose, so a reminder can say
          something is due at nine without being able to say what. What it cannot see is any of the
          words.
        </p>
      </CardContent>
    </Card>
  );
}
