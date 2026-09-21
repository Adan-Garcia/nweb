import { useState } from "react";
import { Lock } from "lucide-react";

import { BrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LockScreenProps = {
  error: string | null;
  isWorking: boolean;
  onUnlock: (passphrase: string) => void;
};

/**
 * Stands in for the whole workspace while it is locked. Nothing behind it is rendered, and
 * nothing behind it can be read either: the key is not in memory, so the storage layer
 * refuses every encrypted row.
 */
export function LockScreen({ error, isWorking, onUnlock }: LockScreenProps) {
  const [passphrase, setPassphrase] = useState("");

  const submit = () => {
    if (passphrase.length) {
      onUnlock(passphrase);
    }
  };

  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <BrandIcon className="size-8" />
          {/*
            A real h1: this screen stands in for the whole page. index.css styles h1
            outside any layer, so its size and margin need the `!` modifier to be brought
            back to the card title it is standing in for (CLAUDE.md section 8).
          */}
          <h1 className="m-0! flex items-center gap-2 font-heading text-base! font-medium leading-snug">
            <Lock className="size-4" />
            This workspace is locked
          </h1>
          <CardDescription>
            Your notes, drawings and files are encrypted on this device. Enter the passphrase to
            read them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="unlock-passphrase">Passphrase</Label>
              <Input
                id="unlock-passphrase"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={passphrase}
                onChange={(event) => {
                  setPassphrase(event.currentTarget.value);
                }}
              />
            </div>

            {error ? (
              <p role="alert" className="m-0 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={isWorking || !passphrase.length}>
              {isWorking ? "Unlocking..." : "Unlock"}
            </Button>

            <p className="m-0 text-xs text-muted-foreground">
              There is no account and no server, so nothing can reset this. Without the passphrase
              the notes cannot be recovered.
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
