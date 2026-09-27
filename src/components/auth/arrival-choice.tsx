import { SegmentedControl } from "@/components/layout/segmented-control";
import type { ArrivalMode } from "@/lib/account/server-connect";

const OPTIONS = [
  { value: "merge", label: "Keep both" },
  { value: "replace", label: "Use the account's" },
] as const;

type ArrivalChoiceProps = {
  value: ArrivalMode;
  onChange: (mode: ArrivalMode) => void;
};

/**
 * What happens to the notes already on this device when it signs in to an existing
 * account. Asked only when there are some; both answers keep the account's notes.
 */
export function ArrivalChoice({ value, onChange }: ArrivalChoiceProps) {
  return (
    <div className="grid gap-2 rounded-md border bg-background p-3">
      <p className="text-heading">This device already has notes</p>
      <SegmentedControl
        label="What to do with this device's notes"
        value={value}
        options={OPTIONS}
        onChange={onChange}
      />
      <p className="text-caption text-muted-foreground">
        {value === "merge"
          ? "This device's notes join the account and sync to your other devices. You may see two workspaces to tidy up."
          : "This device's notes are erased and replaced by the account's. Download a backup first if you want to keep them."}
      </p>
    </div>
  );
}
