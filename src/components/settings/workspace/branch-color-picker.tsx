import { BRANCH_COLORS, type BranchColor } from "@/lib/hierarchy/entity-model";
import { cn } from "@/lib/utils";

type BranchColorPickerProps = {
  branchName: string;
  color: BranchColor;
  isDisabled: boolean;
  onPick: (color: BranchColor) => void;
};

/**
 * The colour is stored by name rather than as a class, so the swatches are spelled out
 * here: Tailwind cannot see a class built from a variable, and a template string would
 * leave every one of these missing from the stylesheet.
 */
const SWATCH: Record<BranchColor, string> = {
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
  orange: "bg-orange-500",
  indigo: "bg-indigo-500",
};

export function BranchColorPicker({
  branchName,
  color,
  isDisabled,
  onPick,
}: BranchColorPickerProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="group"
      aria-label={`Colour for ${branchName}`}
    >
      {BRANCH_COLORS.map((candidate) => (
        <button
          key={candidate}
          type="button"
          disabled={isDisabled}
          aria-label={candidate}
          aria-pressed={candidate === color}
          onClick={() => {
            onPick(candidate);
          }}
          className={cn(
            "size-5 rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            SWATCH[candidate],
            candidate === color
              ? "ring-2 ring-foreground ring-offset-2"
              : "opacity-60 hover:opacity-100",
          )}
        />
      ))}
    </div>
  );
}
