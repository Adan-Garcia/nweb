import { Search, Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { BrandIcon } from "@/components/layout/brand-icon";
import { NotificationBell } from "@/components/shell/notification-bell";
import { orderNavItems } from "@/components/shell/workspace-nav";
import { ThemeMenu } from "@/components/theme/theme-menu";
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAppearance } from "@/hooks/use-appearance";
import { useCommandPaletteStore } from "@/stores/use-command-palette-store";

/**
 * The workspace's navigation: search, the pages in the order someone arranged them, and
 * settings. Collapses to icons on a wide screen and opens as a sheet from the tab bar's
 * "More" on a narrow one.
 */
export function WorkspaceSidebar() {
  const { pathname } = useLocation();
  const { preferences } = useAppearance();
  const { setOpenMobile } = useSidebar();
  const openPalette = useCommandPaletteStore((state) => state.setOpen);
  const closeSheet = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex-row items-center justify-between gap-2 p-3 group-data-[collapsible=icon]:justify-center">
        <Link
          to="/dashboard"
          onClick={closeSheet}
          className="flex min-w-0 items-center gap-2.5 rounded-md px-1 py-0.5 text-sidebar-foreground group-data-[collapsible=icon]:hidden"
        >
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BrandIcon className="size-4" />
          </span>
          <span className="truncate text-heading">Cuervo Planner</span>
        </Link>
        <SidebarTrigger className="hidden md:inline-flex" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Search"
                onClick={() => {
                  closeSheet();
                  openPalette(true);
                }}
                className="text-muted-foreground"
              >
                <Search />
                <span>Search</span>
                <kbd className="ml-auto rounded border border-sidebar-border px-1 font-sans text-caption text-muted-foreground">
                  ⌘K
                </kbd>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {orderNavItems(preferences.navOrder).map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={pathname === item.url}
                    render={<Link to={item.url} onClick={closeSheet} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-1 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Settings"
              isActive={pathname === "/settings"}
              render={<Link to="/settings" onClick={closeSheet} />}
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-1 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
          <NotificationBell />
          <ThemeMenu settingsHref="/settings#appearance" />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
