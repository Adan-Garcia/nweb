import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EraseDeviceFormProps = {
  isServerConnected: boolean;
  isDisabled: boolean;
  onErase: (passphrase: string, alsoServer: boolean) => void;
};

/**
 * Deleting the local account: every note, key and setting on this device, gone. The
 * passphrase and a typed word are both asked for, because there is no undo.
 */
export function EraseDeviceForm({ isServerConnected, isDisabled, onErase }: EraseDeviceFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [alsoServer, setAlsoServer] = useState(false);
  const canErase = passphrase.length > 0 && confirmation === "ERASE" && !isDisabled;

  if (!isOpen) {
    return (
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="w-fit"
        onClick={() => setIsOpen(true)}
      >
        Delete this device's account
      </Button>
    );
  }

  return (
    <form
      className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
      onSubmit={(event) => {
        event.preventDefault();

        if (canErase) {
          onErase(passphrase, isServerConnected && alsoServer);
        }
      }}
    >
      <p className="text-body">
        Everything on this device is erased: every note, task, file and setting.
        {isServerConnected
          ? " The server keeps its copy unless you delete that too."
          : " Without a server account there is no other copy — download a backup first."}
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="erase-passphrase">Your passphrase</Label>
        <Input
          id="erase-passphrase"
          type="password"
          autoComplete="current-password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.currentTarget.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="erase-confirmation">Type ERASE to confirm</Label>
        <Input
          id="erase-confirmation"
          autoComplete="off"
          value={confirmation}
          onChange={(event) => setConfirmation(event.currentTarget.value)}
        />
      </div>
      {isServerConnected ? (
        <label className="flex items-center gap-2 text-body">
          <input
            type="checkbox"
            checked={alsoServer}
            onChange={(event) => setAlsoServer(event.currentTarget.checked)}
          />
          Also delete my server account and everything it holds
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={!canErase}>
          Erase this device
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            // A passphrase is not left behind in a closed form.
            setPassphrase("");
            setConfirmation("");
            setIsOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
