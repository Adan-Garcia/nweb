import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EmailPassphraseFormProps = {
  idPrefix: string;
  initialEmail: string;
  passphraseLabel: string;
  submitLabel: string;
  isDisabled: boolean;
  /** Anything else the form asks, between the fields and the buttons. */
  children?: ReactNode;
  onSubmit: (email: string, passphrase: string) => void;
  onCancel: () => void;
};

/** An address and a passphrase: what creating or signing in to a server account asks. */
export function EmailPassphraseForm({
  idPrefix,
  initialEmail,
  passphraseLabel,
  submitLabel,
  isDisabled,
  children,
  onSubmit,
  onCancel,
}: EmailPassphraseFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [passphrase, setPassphrase] = useState("");
  const canSubmit = email.includes("@") && passphrase.length > 0 && !isDisabled;

  return (
    <form
      className="grid gap-3 rounded-lg border bg-muted/30 p-3"
      onSubmit={(event) => {
        event.preventDefault();

        if (canSubmit) {
          onSubmit(email.trim(), passphrase);
        }
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-email`}>Email</Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.currentTarget.value);
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-passphrase`}>{passphraseLabel}</Label>
        <Input
          id={`${idPrefix}-passphrase`}
          type="password"
          autoComplete="current-password"
          value={passphrase}
          onChange={(event) => {
            setPassphrase(event.currentTarget.value);
          }}
        />
      </div>
      {children}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
