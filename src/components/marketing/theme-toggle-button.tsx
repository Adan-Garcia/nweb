import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

type ThemeToggleButtonProps = {
  isDark: boolean
  onToggle: () => void
}

export function ThemeToggleButton({ isDark, onToggle }: ThemeToggleButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </Button>
  )
}
