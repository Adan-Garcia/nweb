import { Palette } from "lucide-react";
import { Link } from "react-router-dom";

import { THEME_OPTIONS } from "@/components/appearance-options";
import { ThemeIcon, type ThemeMenuProps } from "@/components/theme-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppearance } from "@/hooks/use-appearance";
import { THEME_MODES } from "@/lib/preferences/preferences-model";
import { cn } from "@/lib/utils";

/** The theme menu itself; `theme-menu.tsx` loads it on demand. */
export function ThemeMenuDropdown({ className, settingsHref }: ThemeMenuProps) {
  const { preferences, update, isDark } = useAppearance();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Theme"
            className={cn("shrink-0", className)}
          />
        }
      >
        <ThemeIcon isDark={isDark} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={preferences.theme}
            onValueChange={(value: unknown) => {
              const theme = THEME_MODES.find((mode) => mode === value);

              if (theme) {
                update({ theme });
              }
            }}
          >
            {THEME_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <option.icon className="size-4 text-muted-foreground" />
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {settingsHref ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link to={settingsHref} />}>
              <Palette className="size-4 text-muted-foreground" />
              Customize…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
