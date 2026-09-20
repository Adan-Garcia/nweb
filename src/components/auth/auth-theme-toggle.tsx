import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Breakpoints match the original stylesheet (`max-width: 960px` / `560px`); Tailwind's
// `max-[N]` is exclusive, hence 961/561.
const POSITION = "absolute top-4 right-4 z-[3] max-[561px]:top-[0.8rem] max-[561px]:right-[0.8rem]";
const SURFACE =
  "gap-[0.45rem] bg-clip-border backdrop-blur-[6px] " +
  "border-[oklch(0.8_0.01_286/0.8)] bg-[oklch(1_0_0/0.85)] hover:bg-[oklch(1_0_0/0.85)] " +
  "dark:border-[oklch(0.5_0.01_286/0.8)] dark:bg-[oklch(0.23_0.01_286/0.82)] dark:hover:bg-[oklch(0.23_0.01_286/0.82)]";

type AuthThemeToggleProps = {
  isDark: boolean;
  onToggle: () => void;
};

/** The floating light/dark switch in the corner of the auth pages. */
export function AuthThemeToggle({ isDark, onToggle }: AuthThemeToggleProps) {
  const Icon = isDark ? SunIcon : MoonIcon;

  return (
    <Button
      variant="outline"
      size="sm"
      type="button"
      onClick={onToggle}
      className={cn(POSITION, SURFACE)}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <Icon className="size-[0.95rem]" />
    </Button>
  );
}
