import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccountJoinFormProps = {
  /** True when this workspace already has a passphrase, which has to be given to move it. */
  needsCurrentPassphrase: boolean;
  isDisabled: boolean;
  onSubmit: (email: string, passphrase: string, currentPassphrase?: string) => void;
  onCancel: () => void;
};

/**
 * What creating an account asks for: an address, a passphrase, and — when this workspace is
 * already locked — the passphrase it is locked with, because the notes have to be read
 * before they can be written back under the account's key.
 */
export function AccountJoinForm({
  needsCurrentPassphrase,
  isDisabled,
  onSubmit,
  onCancel,
}: AccountJoinFormProps) {
  const [email, setEmail] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [current, setCurrent] = useState("");

  const isComplete =
    email.includes("@") && passphrase.length > 0 && (!needsCurrentPassphrase || current.length > 0);

  return (
    <form
      className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3"
      onSubmit={(event) => {
        event.preventDefault();

        if (isComplete) {
          onSubmit(email, passphrase, needsCurrentPassphrase ? current : undefined);
        }
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="account-email">Email</Label>
        <Input
          id="account-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.currentTarget.value);
          }}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="account-passphrase">Account passphrase</Label>
        <Input
          id="account-passphrase"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(event) => {
            setPassphrase(event.currentTarget.value);
          }}
        />
        <p className="m-0 text-xs text-muted-foreground">
          The server never sees it. It proves who you are with something derived from it, and opens
          your notes with something else derived from it — holding one says nothing about the other.
          Nobody can reset it.
        </p>
      </div>

      {needsCurrentPassphrase ? (
        <div className="grid gap-2">
          <Label htmlFor="account-current-passphrase">This workspace&rsquo;s passphrase</Label>
          <Input
            id="account-current-passphrase"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => {
              setCurrent(event.currentTarget.value);
            }}
          />
          <p className="m-0 text-xs text-muted-foreground">
            Needed once, to read what is already here before it is written back under the
            account&rsquo;s key.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={isDisabled || !isComplete}>
          Create the account
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
