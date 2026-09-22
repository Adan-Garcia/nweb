import { Download, Lock, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

type BackupActionsProps = {
  isWorking: boolean;
  isEncrypting: boolean;
  /** Whether this workspace has a passphrase, which a plain download does not carry. */
  isLockSet: boolean;
  onExport: () => void;
  onToggleEncrypting: () => void;
  onPickFile: () => void;
};

/**
 * The three things a backup card does, and a plain word about the first one.
 *
 * A backup is written in the clear so it can be restored anywhere — the workspace key
 * exists only in this browser, and a file carrying rows sealed under it could be opened
 * nowhere else. That is the right trade for a file that has to be portable. It is not one
 * to make quietly on behalf of someone who went to the trouble of setting a passphrase.
 */
export function BackupActions({
  isWorking,
  isEncrypting,
  isLockSet,
  onExport,
  onToggleEncrypting,
  onPickFile,
}: BackupActionsProps) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={onExport} disabled={isWorking}>
          <Download className="size-4" />
          Download backup
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isWorking}
          aria-pressed={isEncrypting}
          onClick={onToggleEncrypting}
        >
          <Lock className="size-4" />
          Encrypt a backup
        </Button>
        <Button type="button" variant="outline" disabled={isWorking} onClick={onPickFile}>
          <Upload className="size-4" />
          Restore from file
        </Button>
      </div>

      <p className="m-0 text-sm text-muted-foreground">
        {isLockSet
          ? "A plain download is not encrypted, even though this workspace is: it writes every note, title and file to disk in the clear, so that it can be restored on a device that has never had your passphrase. Use “Encrypt a backup” for a file you are going to keep or send."
          : "A plain download is not encrypted. Use “Encrypt a backup” for a file you are going to keep or send."}
      </p>
    </div>
  );
}
