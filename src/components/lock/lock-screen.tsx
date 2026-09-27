import { useState } from "react";
import { Lock } from "lucide-react";

import { CenteredScreen } from "@/components/layout/centered-screen";
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
    <CenteredScreen>
      <Card>
        <CardHeader>
          {/* A real h1: this screen stands in for the whole page. */}
          <h1 className="flex items-center gap-2 text-heading">
            <Lock className="size-4" />
            This workspace is locked
          </h1>
          <CardDescription>
            Your notes, drawings, files and titles are encrypted on this device. Enter the
            passphrase to read them.
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
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={isWorking || !passphrase.length}>
              {isWorking ? "Unlocking..." : "Unlock"}
            </Button>

            <p className="text-caption text-muted-foreground">
              There is no account and no server, so nothing can reset this. Without the passphrase
              the notes cannot be recovered.
            </p>
          </form>
        </CardContent>
      </Card>
    </CenteredScreen>
  );
}
