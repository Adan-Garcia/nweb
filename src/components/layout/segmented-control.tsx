import { cn } from "@/lib/utils";

type SegmentedOption<Value extends string> = { value: Value; label: string };

type SegmentedControlProps<Value extends string> = {
  label: string;
  value: Value;
  options: readonly SegmentedOption<Value>[];
  onChange: (value: Value) => void;
  className?: string;
};

/**
 * A small set of mutually exclusive views — month or week, path or tree — as one pill.
 * Buttons with `aria-pressed` rather than tabs: switching a view does not move focus into
 * a panel, so a tab list would promise a keyboard model this does not have.
 */
export function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<Value>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5", className)}
    >
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-caption font-medium transition-colors",
              isActive
                ? "bg-background text-foreground ring-1 ring-foreground/10"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
