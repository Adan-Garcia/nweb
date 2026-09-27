import { useState } from "react";
import { KeyRound } from "lucide-react";

import { CenteredScreen } from "@/components/centered-screen";
import { RekeyProgressBar } from "@/components/rekey-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RekeyProgress } from "@/lib/lock/workspace-rekey";

type RekeyResumeScreenProps = {
  /** Which sides the interrupted rekey still needs a passphrase for. */
  needed: ("source" | "target")[];
  error: string | null;
  isWorking: boolean;
  progress: RekeyProgress | null;
  onResume: (passphrases: { source?: string; target?: string }) => void;
};

const FIELDS = {
  source: {
    id: "resume-source-passphrase",
    label: "The passphrase it was moving from",
    autoComplete: "current-password",
  },
  target: {
    id: "resume-target-passphrase",
    label: "The passphrase it was moving to",
    autoComplete: "new-password",
  },
} as const;

/**
 * Stands in for the whole workspace when a passphrase change did not finish.
 *
 * Half the rows are under one key and half under the other, so the app cannot be used
 * until the move is completed — and completing it needs whichever passphrases were
 * involved. Nothing has been lost at this point: both keys are derivable from what the
 * journal recorded, which is the entire reason the journal is written first.
 */
export function RekeyResumeScreen({
  needed,
  error,
  isWorking,
  progress,
  onResume,
}: RekeyResumeScreenProps) {
  const [entered, setEntered] = useState<{ source: string; target: string }>({
    source: "",
    target: "",
  });

  const canSubmit = needed.every((side) => entered[side].length > 0) && !isWorking;

  return (
    <CenteredScreen>
      <Card>
        <CardHeader>
          {/* A real h1: this screen stands in for the whole page. */}
          <h1 className="flex items-center gap-2 text-heading">
            <KeyRound className="size-4" />
            Finish encrypting this workspace
          </h1>
          <CardDescription>
            A passphrase change was interrupted before it finished, so some of your notes are under
            the old key and some under the new one. Nothing is lost. Enter the passphrase below and
            it will pick up where it stopped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();

              if (canSubmit) {
                onResume({
                  source: needed.includes("source") ? entered.source : undefined,
                  target: needed.includes("target") ? entered.target : undefined,
                });
              }
            }}
          >
            {needed.map((side) => (
              <div key={side} className="grid gap-1.5">
                <Label htmlFor={FIELDS[side].id}>{FIELDS[side].label}</Label>
                <Input
                  id={FIELDS[side].id}
                  type="password"
                  autoComplete={FIELDS[side].autoComplete}
                  value={entered[side]}
                  onChange={(event) => {
                    const { value } = event.currentTarget;
                    setEntered((current) => ({ ...current, [side]: value }));
                  }}
                />
              </div>
            ))}

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <RekeyProgressBar progress={progress} label="Finishing" />

            <Button type="submit" disabled={!canSubmit}>
              {isWorking ? "Finishing..." : "Finish the change"}
            </Button>

            <p className="text-caption text-muted-foreground">
              Leave this open until it is done. Closing it early is safe — it will ask again — but
              the workspace cannot be used until the move finishes.
            </p>
          </form>
        </CardContent>
      </Card>
    </CenteredScreen>
  );
}
