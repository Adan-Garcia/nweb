import { Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { orderNavItems } from "@/components/shell/workspace-nav";
import { useSidebar } from "@/components/ui/sidebar";
import { useAppearance } from "@/hooks/use-appearance";
import { cn } from "@/lib/utils";

const TAB =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium transition-colors";

/**
 * The workspace's navigation on a phone: the four pages within a thumb's reach, and "More"
 * for everything the sidebar holds (search, settings, theme, notifications).
 */
export function MobileTabBar() {
  const { pathname } = useLocation();
  const { preferences } = useAppearance();
  const { setOpenMobile } = useSidebar();

  return (
    <nav
      aria-label="Workspace"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {orderNavItems(preferences.navOrder).map((item) => {
        const isActive = pathname === item.url;

        return (
          <Link
            key={item.id}
            to={item.url}
            aria-current={isActive ? "page" : undefined}
            className={cn(TAB, isActive ? "text-primary" : "text-muted-foreground")}
          >
            <item.icon className="size-5" />
            {item.title}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className={cn(TAB, "text-muted-foreground")}
      >
        <Menu className="size-5" />
        More
      </button>
    </nav>
  );
}
