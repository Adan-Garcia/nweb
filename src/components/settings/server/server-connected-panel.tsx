import { useState } from "react";

import { PassphraseField } from "@/components/settings/passphrase-field";
import { Button } from "@/components/ui/button";
import type { SyncReport } from "@/lib/sync/sync-service";

type ServerConnectedPanelProps = {
  email: string;
  lastSync: SyncReport | null;
  isWorking: boolean;
  onSync: () => void;
  onDisconnect: (passphrase: string) => void;
  onDelete: (passphrase: string) => void;
};

/** A device on a server account: sync it, take it off, or delete the account outright. */
export function ServerConnectedPanel({
  email,
  lastSync,
  isWorking,
  onSync,
  onDisconnect,
  onDelete,
}: ServerConnectedPanelProps) {
  const [pending, setPending] = useState<"disconnect" | "delete" | null>(null);

  return (
    <div className="grid gap-3">
      <p className="text-body">
        Syncing as <strong>{email}</strong>.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={isWorking} onClick={onSync}>
          Sync now
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isWorking}
          onClick={() => setPending(pending === "disconnect" ? null : "disconnect")}
        >
          Disconnect
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isWorking}
          onClick={() => setPending(pending === "delete" ? null : "delete")}
        >
          Delete server account
        </Button>
      </div>

      {lastSync ? (
        <p className="text-caption text-muted-foreground">
          Sent {lastSync.pushed}, received {lastSync.applied}, and {lastSync.media} file
          {lastSync.media === 1 ? "" : "s"}.
        </p>
      ) : null}

      {pending === "disconnect" ? (
        <PassphraseField
          id="server-disconnect"
          label="Your passphrase"
          hint="Your notes stay on this device. What others shared with you is removed from it. The account stays on the server, and you can sign back in later."
          submitLabel="Disconnect this device"
          isDisabled={isWorking}
          onSubmit={(passphrase) => {
            onDisconnect(passphrase);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}

      {pending === "delete" ? (
        <PassphraseField
          id="server-delete"
          label="Your passphrase"
          hint="Erases everything the server holds for this account — every synced note, file and share — and cannot be undone. This device keeps its notes; other devices on the account stop syncing."
          submitLabel="Delete it for good"
          isDisabled={isWorking}
          onSubmit={(passphrase) => {
            onDelete(passphrase);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </div>
  );
}
