import { MoonIcon, Settings, SunIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { BrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { NAVIGATION_ITEMS } from "@/components/workspace-nav";

export function WorkspaceSidebar({
  isDark,
  onToggleTheme,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const location = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-4 px-4 py-5">
        <div className="flex items-start justify-between gap-2 group-data-[collapsible=icon]:justify-center flex-wrap">
          <Link
            to="/dashboard"
            className="flex items-center justify-center text-sidebar-foreground group-data-[collapsible=icon]:px-1.5 group-data-[collapsible=icon]:justify-center"
          >
            <BrandIcon className="size-7 shrink-0" />
            <div className="min-w-4 group-data-[collapsible=icon]:hidden"></div>
            <div className="grid gap-0.5 transition-[opacity,width] duration-200 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:overflow-hidden group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold leading-none">Cuervo Planner</span>
              <span className="text-xs text-sidebar-foreground/70">Dashboard workspace</span>
            </div>
          </Link>
          <SidebarTrigger className="hidden md:inline-flex" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAVIGATION_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.url;

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton isActive={isActive} render={<Link to={item.url} />}>
                      <Icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3 p-4 group-data-[collapsible=icon]:px-2 justify-items-center items-center">
        <SidebarSeparator />
        <div className=" max-w-fit flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/40 text-sidebar-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1.5 group-data-[collapsible=icon]:max-w-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleTheme}
            aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
            className="shrink-0 "
          >
            {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Settings"
            render={<Link to="/settings" />}
          >
            <Settings className="size-4" />
          </Button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
