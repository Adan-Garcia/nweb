import { lazy, Suspense } from "react";
import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppearance } from "@/hooks/use-appearance";
import { cn } from "@/lib/utils";

export type ThemeMenuProps = {
  className?: string;
  /** Where the full appearance settings are, when this screen can get there. */
  settingsHref?: string;
};

// The menu primitive and its positioning engine are most of what the landing page would
// otherwise add to the entry chunk, for a control nobody needs in the first second.
const ThemeMenuDropdown = lazy(async () => ({
  default: (await import("@/components/theme-menu-dropdown")).ThemeMenuDropdown,
}));

/**
 * The theme switch every screen shares: the landing page, the auth pages, onboarding and
 * the workspace sidebar. A menu rather than a toggle, because there are five themes.
 * Until the menu has loaded, the same button stands in for it, so nothing moves.
 */
export function ThemeMenu(props: ThemeMenuProps) {
  const { isDark } = useAppearance();

  return (
    <Suspense
      fallback={
        <Button
          variant="ghost"
          size="icon"
          aria-label="Theme"
          disabled
          className={cn("shrink-0 disabled:opacity-100", props.className)}
        >
          <ThemeIcon isDark={isDark} />
        </Button>
      }
    >
      <ThemeMenuDropdown {...props} />
    </Suspense>
  );
}

export function ThemeIcon({ isDark }: { isDark: boolean }) {
  return isDark ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />;
}
