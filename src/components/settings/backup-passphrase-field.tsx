import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BackupPassphraseFieldProps = {
  id: string;
  label: string;
  hint: string;
  submitLabel: string;
  isDisabled: boolean;
  onSubmit: (passphrase: string) => void;
  onCancel?: () => void;
};

/** A passphrase and the button that uses it, for encrypting an export or opening one. */
export function BackupPassphraseField({
  id,
  label,
  hint,
  submitLabel,
  isDisabled,
  onSubmit,
  onCancel,
}: BackupPassphraseFieldProps) {
  const [passphrase, setPassphrase] = useState("");

  const submit = () => {
    if (!passphrase.length) {
      return;
    }

    onSubmit(passphrase);
    setPassphrase("");
  };

  return (
    <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/20 p-3">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        autoComplete="new-password"
        value={passphrase}
        onChange={(event) => {
          setPassphrase(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />
      <p className="m-0 text-xs text-muted-foreground">{hint}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={isDisabled || !passphrase.length}
        >
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
