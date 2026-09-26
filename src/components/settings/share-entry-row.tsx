import type { ShareRole } from "@shared/sharing-contract";

import type { ShareEntry } from "@/components/settings/use-sharing";
import { Button } from "@/components/ui/button";

type ShareEntryRowProps = {
  entry: ShareEntry;
  isDisabled: boolean;
  onChangeRole: (role: ShareRole) => void;
  onRevoke: () => void;
};

/**
 * One person something is shared with: what they may do, changeable in place, and a way to
 * take it back. Changing the role re-shares at the new one; the key they hold is the same,
 * because reading was never the part a role decides.
 */
export function ShareEntryRow({ entry, isDisabled, onChangeRole, onRevoke }: ShareEntryRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm">{entry.email}</span>
      <span className="flex items-center gap-2">
        <select
          aria-label={`What ${entry.email} can do`}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          value={entry.role}
          disabled={isDisabled}
          onChange={(event) => {
            onChangeRole(event.currentTarget.value === "writer" ? "writer" : "reader");
          }}
        >
          <option value="reader">Can read</option>
          <option value="writer">Can change</option>
        </select>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isDisabled}
          aria-label={`Remove ${entry.email}`}
          onClick={onRevoke}
        >
          Remove
        </Button>
      </span>
    </li>
  );
}
