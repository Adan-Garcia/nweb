import { useRef, useState } from "react";

import { BackupActions } from "@/components/settings/backup-actions";
import { BackupPassphraseField } from "@/components/settings/backup-passphrase-field";
import { RestoreModeField } from "@/components/settings/restore-mode-field";
import type { BackupStatus } from "@/components/settings/use-workspace-backup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RestoreMode } from "@/lib/workspace-restore";

type BackupCardProps = {
  status: BackupStatus;
  needsPassphrase: boolean;
  /** Whether this workspace has a passphrase, which a plain download does not carry. */
  isLockSet: boolean;
  restoreMode: RestoreMode;
  onChooseRestoreMode: (mode: RestoreMode) => void;
  onExport: (passphrase?: string) => void;
  onImport: (file: File) => void;
  onUnlock: (passphrase: string) => void;
  onCancelUnlock: () => void;
};

/** Export and import controls: the only backup the app has while there is no server. */
export function BackupCard({
  status,
  needsPassphrase,
  isLockSet,
  restoreMode,
  onChooseRestoreMode,
  onExport,
  onImport,
  onUnlock,
  onCancelUnlock,
}: BackupCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const isWorking = status.kind === "working";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup</CardTitle>
        <CardDescription>
          Your notes and events live only in this browser. Clearing site data erases them, so keep a
          backup file somewhere else.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <BackupActions
          isWorking={isWorking}
          isEncrypting={isEncrypting}
          isLockSet={isLockSet}
          onExport={() => onExport()}
          onToggleEncrypting={() => {
            setIsEncrypting((current) => !current);
          }}
          onPickFile={() => fileInputRef.current?.click()}
        />

        {isEncrypting && !needsPassphrase ? (
          <BackupPassphraseField
            id="export-passphrase"
            label="Passphrase for this backup"
            hint="The file is encrypted with AES-GCM under this passphrase. There is no account and no server, so nothing can reset it: forget the passphrase and the file is gone."
            submitLabel="Download encrypted backup"
            isDisabled={isWorking}
            onSubmit={(passphrase) => {
              onExport(passphrase);
              setIsEncrypting(false);
            }}
            onCancel={() => {
              setIsEncrypting(false);
            }}
          />
        ) : null}

        {needsPassphrase ? (
          <BackupPassphraseField
            id="import-passphrase"
            label="This backup is encrypted"
            hint="Enter the passphrase it was exported with."
            submitLabel="Unlock and restore"
            isDisabled={isWorking}
            onSubmit={onUnlock}
            onCancel={onCancelUnlock}
          />
        ) : null}

        <RestoreModeField
          restoreMode={restoreMode}
          isDisabled={isWorking}
          onChoose={onChooseRestoreMode}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Backup file"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onImport(file);
            }

            event.target.value = "";
          }}
        />

        {status.kind === "done" || status.kind === "error" ? (
          <p
            role="status"
            className={
              status.kind === "error" ? "m-0 text-sm text-destructive" : "m-0 text-sm text-primary"
            }
          >
            {status.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
