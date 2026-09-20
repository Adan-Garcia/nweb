import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type ThemeToggleButtonProps = {
  isDark: boolean;
  onToggle: () => void;
  variant?: "ghost" | "outline";
  size?: "icon" | "sm";
};

export function ThemeToggleButton({
  isDark,
  onToggle,
  variant = "ghost",
  size = "icon",
}: ThemeToggleButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </Button>
  );
}
