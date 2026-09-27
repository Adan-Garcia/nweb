import { useRef, useState } from "react";

import { BackupActions } from "@/components/settings/backup/backup-actions";
import { RestoreModeField } from "@/components/settings/backup/restore-mode-field";
import type { BackupStatus } from "@/components/settings/backup/use-workspace-backup";
import { PassphraseField } from "@/components/settings/passphrase-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RestoreMode } from "@/lib/backup/workspace-restore";

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
          <PassphraseField
            id="export-passphrase"
            label="Passphrase for this backup"
            hint="The file is encrypted with AES-GCM under this passphrase. Nothing can reset it: forget the passphrase and the file cannot be opened."
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
          <PassphraseField
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
