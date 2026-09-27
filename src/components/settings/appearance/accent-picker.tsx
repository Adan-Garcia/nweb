import { Check } from "lucide-react";

import { ACCENT_LABELS } from "@/components/theme/appearance-options";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type Accent, ACCENTS } from "@/lib/preferences/preferences-model";

type AccentPickerProps = {
  value: Accent;
  onChange: (accent: Accent) => void;
};

/**
 * The accent swatches. Each is drawn by `data-swatch`, which the stylesheet turns into that
 * accent at the current theme's lightness, so the swatch is the colour the app will be.
 */
export function AccentPicker({ value, onChange }: AccentPickerProps) {
  return (
    <ToggleGroup
      aria-label="Accent colour"
      value={[value]}
      onValueChange={(values: unknown[]) => {
        const next = ACCENTS.find((accent) => values.includes(accent));

        if (next) {
          onChange(next);
        }
      }}
      className="flex flex-wrap gap-2"
    >
      {ACCENTS.map((accent) => (
        <ToggleGroupItem
          key={accent}
          value={accent}
          aria-label={ACCENT_LABELS[accent]}
          title={ACCENT_LABELS[accent]}
          className="size-9 rounded-full p-0 ring-offset-2 ring-offset-background aria-pressed:bg-transparent aria-pressed:ring-2 aria-pressed:ring-foreground/60"
        >
          <span
            data-swatch={accent}
            className="inline-flex size-7 items-center justify-center rounded-full bg-swatch text-primary-foreground"
          >
            {accent === value ? <Check className="size-3.5" strokeWidth={3} /> : null}
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
