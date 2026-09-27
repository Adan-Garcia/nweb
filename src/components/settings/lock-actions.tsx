import { KeyRound, Lock, LockOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { WorkspaceLockState } from "@/lib/lock/workspace-lock-model";

/** Which passphrase form the card is showing, or none. */
export type LockAction = "create" | "change" | "remove";

type LockActionsProps = {
  state: WorkspaceLockState;
  pendingAction: LockAction | null;
  isWorking: boolean;
  onToggle: (action: LockAction) => void;
  onLock: () => void;
};

export function LockActions({
  state,
  pendingAction,
  isWorking,
  onToggle,
  onLock,
}: LockActionsProps) {
  if (state === "unset") {
    return (
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={isWorking}
          aria-pressed={pendingAction === "create"}
          onClick={() => {
            onToggle("create");
          }}
        >
          <Lock className="size-4" />
          Set a passphrase
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button type="button" variant="outline" disabled={isWorking} onClick={onLock}>
        <Lock className="size-4" />
        Lock now
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={isWorking}
        aria-pressed={pendingAction === "change"}
        onClick={() => {
          onToggle("change");
        }}
      >
        <KeyRound className="size-4" />
        Change the passphrase
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={isWorking}
        aria-pressed={pendingAction === "remove"}
        onClick={() => {
          onToggle("remove");
        }}
      >
        <LockOpen className="size-4" />
        Remove the passphrase
      </Button>
    </div>
  );
}
