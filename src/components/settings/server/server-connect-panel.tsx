import { useState } from "react";

import { ArrivalChoice } from "@/components/auth/arrival-choice";
import { EmailPassphraseForm } from "@/components/settings/server/email-passphrase-form";
import { Button } from "@/components/ui/button";
import type { ArrivalMode } from "@/lib/account/server-connect";

type ServerConnectPanelProps = {
  localEmail: string;
  /** Whether this device already has notes, which is when signing in asks what to keep. */
  hasContent: boolean;
  isWorking: boolean;
  onCreate: (email: string, passphrase: string) => void;
  onSignIn: (email: string, passphrase: string, mode: ArrivalMode) => void;
};

/** A device on no account yet: make one on this server, or sign in to one that exists. */
export function ServerConnectPanel({
  localEmail,
  hasContent,
  isWorking,
  onCreate,
  onSignIn,
}: ServerConnectPanelProps) {
  const [form, setForm] = useState<"create" | "sign-in" | null>(null);
  const [mode, setMode] = useState<ArrivalMode>("merge");

  if (form === "create") {
    return (
      <EmailPassphraseForm
        idPrefix="server-create"
        initialEmail={localEmail}
        passphraseLabel="This device's passphrase"
        submitLabel="Create account"
        isDisabled={isWorking}
        onSubmit={(email, passphrase) => {
          onCreate(email, passphrase);
          setForm(null);
        }}
        onCancel={() => setForm(null)}
      >
        <p className="text-caption text-muted-foreground">
          The account uses the passphrase you already unlock this device with, so there is only ever
          one to remember.
        </p>
      </EmailPassphraseForm>
    );
  }

  if (form === "sign-in") {
    return (
      <EmailPassphraseForm
        idPrefix="server-sign-in"
        initialEmail={localEmail}
        passphraseLabel="Account passphrase"
        submitLabel="Sign in"
        isDisabled={isWorking}
        onSubmit={(email, passphrase) => {
          onSignIn(email, passphrase, hasContent ? mode : "replace");
          setForm(null);
        }}
        onCancel={() => setForm(null)}
      >
        {hasContent ? <ArrivalChoice value={mode} onChange={setMode} /> : null}
        <p className="text-caption text-muted-foreground">
          From then on, the account's passphrase is the one that unlocks this device.
        </p>
      </EmailPassphraseForm>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={isWorking} onClick={() => setForm("create")}>
        Create an account
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isWorking}
        onClick={() => setForm("sign-in")}
      >
        Sign in to an existing account
      </Button>
    </div>
  );
}
