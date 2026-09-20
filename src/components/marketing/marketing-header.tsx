import { BrandIcon } from "@/components/brand-icon";
import { MARKETING_LINKS } from "@/components/marketing/marketing-nav";
import { ThemeToggleButton } from "@/components/marketing/theme-toggle-button";
import { cn } from "@/lib/utils";

type MarketingHeaderProps = {
  /** The `href` of the page being viewed; its link is highlighted. */
  activeHref?: string;
  isDark: boolean;
  onToggleTheme: () => void;
};

export function MarketingHeader({ activeHref, isDark, onToggleTheme }: MarketingHeaderProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <a href="/" className="inline-flex items-center gap-2 font-semibold">
          <BrandIcon className="size-8" />
          <span>Cuervo Planner</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {MARKETING_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium",
                link.href === activeHref ? "text-primary" : "text-foreground hover:text-primary",
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <ThemeToggleButton isDark={isDark} onToggle={onToggleTheme} />
      </div>
    </header>
  );
}
