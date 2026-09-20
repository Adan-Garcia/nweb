import type { ReactNode } from "react";

import { MarketingHeader } from "@/components/marketing/marketing-header";
import { useThemeMode } from "@/hooks/use-theme-mode";

type MarketingPageProps = {
  activeHref?: string;
  children: ReactNode;
};

/** Page chrome for the public information pages: header, theme and background. */
export function MarketingPage({ activeHref, children }: MarketingPageProps) {
  const { isDark, toggleTheme } = useThemeMode();

  return (
    <main className="min-h-screen w-full bg-background text-foreground">
      <MarketingHeader activeHref={activeHref} isDark={isDark} onToggleTheme={toggleTheme} />
      {children}
    </main>
  );
}
