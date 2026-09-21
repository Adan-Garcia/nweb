import { useCallback, useState } from "react";

import { downloadTextFile } from "@/lib/blob-utils";
import type { EncryptedEnvelope } from "@/lib/crypto-envelope";
import {
  createWorkspaceBackup,
  decryptWorkspaceBackup,
  encryptWorkspaceBackup,
  type ParsedBackupFile,
  parseWorkspaceBackup,
} from "@/lib/workspace-backup";
import { restoreWorkspaceBackup } from "@/lib/workspace-restore";

export type BackupStatus =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

function backupFileName(now: Date, isEncrypted: boolean) {
  const stamp = now.toISOString().slice(0, 10);

  return `cuervo-planner-backup-${stamp}${isEncrypted ? "-encrypted" : ""}.json`;
}

/** Drives the export and import controls on the settings page. */
export function useWorkspaceBackup() {
  const [status, setStatus] = useState<BackupStatus>({ kind: "idle" });
  /** Set when a file turns out to be encrypted, so the UI can ask for the passphrase. */
  const [pendingEncrypted, setPendingEncrypted] = useState<EncryptedEnvelope | null>(null);

  const exportWorkspace = useCallback(async (passphrase?: string) => {
    setStatus({ kind: "working" });

    try {
      const now = new Date();
      const backup = await createWorkspaceBackup(now);
      const isEncrypted = Boolean(passphrase);
      const payload = passphrase ? await encryptWorkspaceBackup(backup, passphrase) : backup;

      downloadTextFile(
        JSON.stringify(payload, null, 2),
        backupFileName(now, isEncrypted),
        "application/json",
      );
      setStatus({
        kind: "done",
        message: `Saved ${backup.notes.directory.length} notes and ${backup.twigs.length} tasks${
          isEncrypted ? ", encrypted" : ""
        }.`,
      });
    } catch {
      setStatus({ kind: "error", message: "Could not read your workspace. Nothing was exported." });
    }
  }, []);

  /** Shared by a plaintext file and by one that has just been decrypted. */
  const applyParsed = useCallback(async (parsed: ParsedBackupFile) => {
    if ("error" in parsed) {
      setStatus({ kind: "error", message: parsed.error });
      return;
    }

    if ("encrypted" in parsed) {
      setPendingEncrypted(parsed.encrypted);
      setStatus({ kind: "idle" });
      return;
    }

    try {
      const summary = await restoreWorkspaceBackup(parsed.backup);

      setPendingEncrypted(null);
      setStatus({
        kind: "done",
        message: `Restored ${summary.notes} notes and ${summary.events} tasks. Reload to see them.`,
      });
    } catch {
      setStatus({
        kind: "error",
        message:
          "Could not write the backup to this browser. Your existing data may be incomplete.",
      });
    }
  }, []);

  const importWorkspace = useCallback(
    async (file: File) => {
      setStatus({ kind: "working" });
      setPendingEncrypted(null);

      let raw: string;

      try {
        raw = await file.text();
      } catch {
        setStatus({ kind: "error", message: "Could not read that file." });
        return;
      }

      await applyParsed(parseWorkspaceBackup(raw));
    },
    [applyParsed],
  );

  const unlockImport = useCallback(
    async (passphrase: string) => {
      if (!pendingEncrypted) {
        return;
      }

      setStatus({ kind: "working" });
      await applyParsed(await decryptWorkspaceBackup(pendingEncrypted, passphrase));
    },
    [applyParsed, pendingEncrypted],
  );

  const cancelImport = useCallback(() => {
    setPendingEncrypted(null);
    setStatus({ kind: "idle" });
  }, []);

  return {
    status,
    needsPassphrase: pendingEncrypted !== null,
    exportWorkspace,
    importWorkspace,
    unlockImport,
    cancelImport,
  };
}
