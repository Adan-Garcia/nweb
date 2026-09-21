import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";

import { BackupPassphraseField } from "@/components/settings/backup-passphrase-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkspaceLockState } from "@/lib/workspace-lock-model";

type LockCardProps = {
  state: WorkspaceLockState;
  error: string | null;
  isWorking: boolean;
  onCreate: (passphrase: string) => void;
  onRemove: (passphrase: string) => void;
  onLock: () => void;
};

/**
 * What the honest version of "Device Level Encryption" looks like: a passphrase on this
 * browser, and a plain statement of what it does and does not cover.
 */
export function LockCard({ state, error, isWorking, onCreate, onRemove, onLock }: LockCardProps) {
  const [pendingAction, setPendingAction] = useState<"create" | "remove" | null>(null);

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
        <div className="flex flex-wrap gap-3">
          {state === "unset" ? (
            <Button
              type="button"
              disabled={isWorking}
              aria-pressed={pendingAction === "create"}
              onClick={() => {
                setPendingAction((current) => (current === "create" ? null : "create"));
              }}
            >
              <Lock className="size-4" />
              Set a passphrase
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={isWorking} onClick={onLock}>
                <Lock className="size-4" />
                Lock now
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isWorking}
                aria-pressed={pendingAction === "remove"}
                onClick={() => {
                  setPendingAction((current) => (current === "remove" ? null : "remove"));
                }}
              >
                <LockOpen className="size-4" />
                Remove the passphrase
              </Button>
            </>
          )}
        </div>

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

        {error ? (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <p className="m-0 text-sm text-muted-foreground">
          What this covers: the text of every note, the drawings, and the files. What it does not:
          note titles, course names and due dates stay readable, and nothing protects against a
          browser extension or a compromised page while the workspace is unlocked.
        </p>
      </CardContent>
    </Card>
  );
}
