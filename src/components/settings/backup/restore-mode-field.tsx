import type { RestoreMode } from "@/lib/backup/workspace-restore";

type RestoreModeFieldProps = {
  restoreMode: RestoreMode;
  isDisabled: boolean;
  onChoose: (mode: RestoreMode) => void;
};

/**
 * Replacing is right on a new device and wrong on one that has been used since the file
 * was written; merging is the other way round. Neither is safe enough to be the silent
 * default, so the choice is on screen with what each one does to what is already here.
 */
const RESTORE_CHOICES: { mode: RestoreMode; label: string; hint: string }[] = [
  {
    mode: "replace",
    label: "Replace everything",
    hint: "This browser ends up holding exactly what the file holds. Anything written since it was exported is lost.",
  },
  {
    mode: "merge",
    label: "Merge with what is here",
    hint: "Keeps what this browser has and takes from the file only what is newer, note by note. A deletion on either side stays deleted, unless the file is more than ninety days old.",
  },
];

export function RestoreModeField({ restoreMode, isDisabled, onChoose }: RestoreModeFieldProps) {
  return (
    <fieldset className="grid gap-2 rounded-lg border border-border/70 p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        When restoring
      </legend>

      {RESTORE_CHOICES.map((choice) => (
        <label key={choice.mode} className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="restore-mode"
            className="mt-1"
            value={choice.mode}
            checked={restoreMode === choice.mode}
            disabled={isDisabled}
            onChange={() => {
              onChoose(choice.mode);
            }}
          />
          <span>
            {choice.label}
            <span className="block text-xs text-muted-foreground">{choice.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
