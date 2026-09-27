import { Circle } from "lucide-react";

import { ACCENT_LABELS, THEME_OPTIONS } from "@/components/appearance-options";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { useAppearance } from "@/hooks/use-appearance";
import { ACCENTS } from "@/lib/preferences-model";

/** Theme and accent, switchable without leaving the keyboard. */
export function PaletteAppearanceGroup({ onDone }: { onDone: () => void }) {
  const { update } = useAppearance();

  return (
    <CommandGroup heading="Appearance">
      {THEME_OPTIONS.map((option) => (
        <CommandItem
          key={option.value}
          value={`Theme: ${option.label}`}
          onSelect={() => {
            update({ theme: option.value });
            onDone();
          }}
        >
          <option.icon />
          Theme: {option.label}
        </CommandItem>
      ))}
      {ACCENTS.map((accent) => (
        <CommandItem
          key={accent}
          value={`Accent: ${ACCENT_LABELS[accent]}`}
          onSelect={() => {
            update({ accent });
            onDone();
          }}
        >
          <Circle data-swatch={accent} className="fill-swatch text-swatch" />
          Accent: {ACCENT_LABELS[accent]}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
