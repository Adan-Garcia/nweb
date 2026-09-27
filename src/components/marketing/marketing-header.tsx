import { lazy, Suspense } from "react";
import { Menu } from "lucide-react";

import { BrandIcon } from "@/components/layout/brand-icon";
import { MARKETING_LINKS } from "@/components/marketing/marketing-nav";
import { ThemeMenu } from "@/components/theme/theme-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Loaded on demand for the same reason as the theme menu: see `theme-menu.tsx`.
const MarketingMobileMenu = lazy(async () => ({
  default: (await import("@/components/marketing/marketing-mobile-menu")).MarketingMobileMenu,
}));

type MarketingHeaderProps = {
  /** The `href` of the page being viewed; its link is highlighted. */
  activeHref?: string;
};

/** The public pages' header: brand, links (a menu on a phone), theme and the way in. */
export function MarketingHeader({ activeHref }: MarketingHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <a href="/" className="inline-flex items-center gap-2 text-heading">
          <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BrandIcon className="size-4" />
          </span>
          Cuervo Planner
        </a>

        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {MARKETING_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={link.href === activeHref ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-body transition-colors",
                link.href === activeHref
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeMenu />
          <Suspense
            fallback={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open menu"
                disabled
                className="md:hidden"
              >
                <Menu className="size-4" />
              </Button>
            }
          >
            <MarketingMobileMenu />
          </Suspense>
          <Button nativeButton={false} render={<a href="/dashboard" />} className="ml-1">
            Open app
          </Button>
        </div>
      </div>
    </header>
  );
}
