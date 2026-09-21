import { useCallback, useState } from "react";

import { downloadTextFile } from "@/lib/blob-utils";
import {
  createWorkspaceBackup,
  parseWorkspaceBackup,
  restoreWorkspaceBackup,
} from "@/lib/workspace-backup";

export type BackupStatus =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

function backupFileName(now: Date) {
  return `cuervo-planner-backup-${now.toISOString().slice(0, 10)}.json`;
}

/** Drives the export and import controls on the settings page. */
export function useWorkspaceBackup() {
  const [status, setStatus] = useState<BackupStatus>({ kind: "idle" });

  const exportWorkspace = useCallback(async () => {
    setStatus({ kind: "working" });

    try {
      const now = new Date();
      const backup = await createWorkspaceBackup(now);

      downloadTextFile(JSON.stringify(backup, null, 2), backupFileName(now), "application/json");
      setStatus({
        kind: "done",
        message: `Saved ${backup.notes.directory.length} notes and ${backup.calendar.length} events.`,
      });
    } catch {
      setStatus({ kind: "error", message: "Could not read your workspace. Nothing was exported." });
    }
  }, []);

  const importWorkspace = useCallback(async (file: File) => {
    setStatus({ kind: "working" });

    let raw: string;

    try {
      raw = await file.text();
    } catch {
      setStatus({ kind: "error", message: "Could not read that file." });
      return;
    }

    const parsed = parseWorkspaceBackup(raw);

    if ("error" in parsed) {
      setStatus({ kind: "error", message: parsed.error });
      return;
    }

    try {
      const summary = await restoreWorkspaceBackup(parsed.backup);

      setStatus({
        kind: "done",
        message: `Restored ${summary.notes} notes and ${summary.events} events. Reload to see them.`,
      });
    } catch {
      setStatus({
        kind: "error",
        message:
          "Could not write the backup to this browser. Your existing data may be incomplete.",
      });
    }
  }, []);

  return { status, exportWorkspace, importWorkspace };
}
