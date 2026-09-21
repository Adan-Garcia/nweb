import { useRef } from "react";
import { Download, Upload } from "lucide-react";

import type { BackupStatus } from "@/components/settings/use-workspace-backup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BackupCardProps = {
  status: BackupStatus;
  onExport: () => void;
  onImport: (file: File) => void;
};

/** Export and import controls: the only backup the app has while there is no server. */
export function BackupCard({ status, onExport, onImport }: BackupCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
          <Button type="button" onClick={onExport} disabled={isWorking}>
            <Download className="size-4" />
            Download backup
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
