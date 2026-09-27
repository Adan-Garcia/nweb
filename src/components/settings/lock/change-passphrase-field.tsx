import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ChangePassphraseFieldProps = {
  isDisabled: boolean;
  onSubmit: (currentPassphrase: string, nextPassphrase: string) => void;
  onCancel: () => void;
};

/**
 * Both passphrases at once, because the change is one pass: the old key opens each row and
 * the new one seals it again, and nothing is written in the clear in between.
 */
export function ChangePassphraseField({
  isDisabled,
  onSubmit,
  onCancel,
}: ChangePassphraseFieldProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const canSubmit = current.length > 0 && next.length > 0 && !isDisabled;

  return (
    <form
      className="grid gap-2 rounded-lg border border-border/70 bg-muted/20 p-3"
      onSubmit={(event) => {
        event.preventDefault();

        if (canSubmit) {
          onSubmit(current, next);
          setCurrent("");
          setNext("");
        }
      }}
    >
      <Label htmlFor="current-lock-passphrase">Current passphrase</Label>
      <Input
        id="current-lock-passphrase"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(event) => {
          setCurrent(event.currentTarget.value);
        }}
      />

      <Label htmlFor="next-lock-passphrase">New passphrase</Label>
      <Input
        id="next-lock-passphrase"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(event) => {
          setNext(event.currentTarget.value);
        }}
      />

      <p className="m-0 text-xs text-muted-foreground">
        Every note, drawing, file and title is re-encrypted under the new passphrase, which can take
        a moment on a full workspace. The old one stops working. Nothing can reset the new one
        either.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          Re-encrypt with the new passphrase
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
