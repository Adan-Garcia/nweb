import { useRef, useState } from "react";
import { Download, Lock, Upload } from "lucide-react";

import { BackupPassphraseField } from "@/components/settings/backup-passphrase-field";
import type { BackupStatus } from "@/components/settings/use-workspace-backup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BackupCardProps = {
  status: BackupStatus;
  needsPassphrase: boolean;
  onExport: (passphrase?: string) => void;
  onImport: (file: File) => void;
  onUnlock: (passphrase: string) => void;
  onCancelUnlock: () => void;
};

/** Export and import controls: the only backup the app has while there is no server. */
export function BackupCard({
  status,
  needsPassphrase,
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
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => onExport()} disabled={isWorking}>
            <Download className="size-4" />
            Download backup
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isWorking}
            aria-pressed={isEncrypting}
            onClick={() => {
              setIsEncrypting((current) => !current);
            }}
          >
            <Lock className="size-4" />
            Encrypt a backup
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isWorking}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" />
            Restore from file
          </Button>
        </div>

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

        <p className="m-0 text-sm text-muted-foreground">
          Restoring replaces everything in this browser with the contents of the file. Export first
          if you want to keep what is here.
        </p>

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
