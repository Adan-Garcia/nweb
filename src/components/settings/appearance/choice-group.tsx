import type { LucideIcon } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type Choice<Value extends string> = { value: Value; label: string; icon?: LucideIcon };

type ChoiceGroupProps<Value extends string> = {
  label: string;
  value: Value;
  choices: readonly Choice<Value>[];
  onChange: (value: Value) => void;
  className?: string;
};

/**
 * One of a few, as a row of pressable tiles. Arrow keys move between them (the toggle
 * group's roving focus), and pressing the chosen one again does not unchoose it.
 */
export function ChoiceGroup<Value extends string>({
  label,
  value,
  choices,
  onChange,
  className,
}: ChoiceGroupProps<Value>) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(values: unknown[]) => {
        const next = choices.find((choice) => values.includes(choice.value));

        if (next) {
          onChange(next.value);
        }
      }}
      className={cn("grid w-full grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))]", className)}
    >
      {choices.map((choice) => (
        <ToggleGroupItem
          key={choice.value}
          value={choice.value}
          variant="outline"
          className="h-auto min-w-0 flex-col gap-1.5 py-3 aria-pressed:border-primary aria-pressed:bg-brand-soft aria-pressed:text-foreground"
        >
          {choice.icon ? <choice.icon className="size-4" /> : null}
          {choice.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
