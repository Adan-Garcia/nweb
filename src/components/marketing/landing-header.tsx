import { BrandIcon } from "@/components/brand-icon";
import { LANDING_LINKS } from "@/components/marketing/marketing-nav";
import { ThemeToggleButton } from "@/components/marketing/theme-toggle-button";

type LandingHeaderProps = {
  isDark: boolean;
  onToggleTheme: () => void;
};

function MobileMenu() {
  return (
    <div className="flex md:hidden flex-1 justify-center">
      <details className="relative">
        <summary className="list-none cursor-pointer px-3 py-2 rounded-md border border-border bg-background shadow-sm flex items-center gap-2">
          <span className="sr-only">Open menu</span>
          <svg
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6"
          >
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </summary>
        <div className="absolute -translate-x-1 mt-2 w-40 rounded-md border border-border bg-background shadow-lg z-50 flex flex-col">
          {LANDING_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              {link.label}
            </a>
          ))}
        </div>
      </details>
    </div>
  );
}

/** The landing page header: brand, a mobile menu, desktop nav and theme toggle. */
export function LandingHeader({ isDark, onToggleTheme }: LandingHeaderProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="mx-auto relative max-w-6xl grid grid-cols-3 items-center px-4 py-4 sm:px-6 lg:px-8">
        <div className="max-h-10 flex items-center gap-2">
          <MobileMenu />
          <a href="#" className="inline-flex items-center gap-2 font-semibold">
            <BrandIcon className="size-8" />
            <span>Cuervo Planner</span>
          </a>
        </div>
        <div>
          <nav className="hidden md:flex justify-center gap-8">
            {LANDING_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-foreground hover:text-primary"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center justify-end gap-4">
          <ThemeToggleButton isDark={isDark} onToggle={onToggleTheme} />
        </div>
      </div>
    </header>
  );
}
