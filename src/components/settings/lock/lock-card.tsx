import { useState } from "react";

import { RekeyProgressBar } from "@/components/lock/rekey-progress";
import { BackupPassphraseField } from "@/components/settings/backup/backup-passphrase-field";
import { ChangePassphraseField } from "@/components/settings/lock/change-passphrase-field";
import { type LockAction, LockActions } from "@/components/settings/lock/lock-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkspaceLockState } from "@/lib/lock/workspace-lock-model";
import type { RekeyProgress } from "@/lib/lock/workspace-rekey";

type LockCardProps = {
  state: WorkspaceLockState;
  error: string | null;
  isWorking: boolean;
  progress: RekeyProgress | null;
  onCreate: (passphrase: string) => void;
  onChange: (currentPassphrase: string, nextPassphrase: string) => void;
  onRemove: (passphrase: string) => void;
  onLock: () => void;
};

/**
 * What the honest version of "Device Level Encryption" looks like: a passphrase on this
 * browser, and a plain statement of what it does and does not cover.
 */
export function LockCard({
  state,
  error,
  isWorking,
  progress,
  onCreate,
  onChange,
  onRemove,
  onLock,
}: LockCardProps) {
  const [pendingAction, setPendingAction] = useState<LockAction | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace lock</CardTitle>
        <CardDescription>
          {state === "unset"
            ? "Set a passphrase and the notes already in this browser are encrypted with it, along with everything written afterwards."
            : "This workspace has a passphrase. It is asked for every time the app is opened."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <LockActions
          state={state}
          pendingAction={pendingAction}
          isWorking={isWorking}
          onToggle={(action) => {
            setPendingAction((current) => (current === action ? null : action));
          }}
          onLock={onLock}
        />

        {pendingAction === "create" ? (
          <BackupPassphraseField
            id="lock-passphrase"
            label="Choose a passphrase"
            hint="Everything already stored is encrypted with it now. There is no account and no server, so nothing can reset it: forget it and the notes are gone."
            submitLabel="Encrypt this workspace"
            isDisabled={isWorking}
            onSubmit={(passphrase) => {
              onCreate(passphrase);
              setPendingAction(null);
            }}
            onCancel={() => {
              setPendingAction(null);
            }}
          />
        ) : null}

        {pendingAction === "change" ? (
          <ChangePassphraseField
            isDisabled={isWorking}
            onSubmit={(currentPassphrase, nextPassphrase) => {
              onChange(currentPassphrase, nextPassphrase);
              setPendingAction(null);
            }}
            onCancel={() => {
              setPendingAction(null);
            }}
          />
        ) : null}

        {pendingAction === "remove" ? (
          <BackupPassphraseField
            id="remove-lock-passphrase"
            label="Confirm the passphrase"
            hint="Removing it writes every note back unencrypted."
            submitLabel="Remove and decrypt"
            isDisabled={isWorking}
            onSubmit={(passphrase) => {
              onRemove(passphrase);
              setPendingAction(null);
            }}
            onCancel={() => {
              setPendingAction(null);
            }}
          />
        ) : null}

        <RekeyProgressBar progress={progress} label="Re-encrypting" />

        {error ? (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <p className="m-0 text-sm text-muted-foreground">
          What this covers: the text of every note, the drawings, the files, and the names the
          workspace is listed by — note titles, course names, task titles. What it does not: due
          dates and times stay readable, so that a reminder can still know when something is due
          without being able to read what it is. Nothing protects against a browser extension or a
          compromised page while the workspace is unlocked.
        </p>
      </CardContent>
    </Card>
  );
}
