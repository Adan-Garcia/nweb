import { Bell } from "lucide-react";
import { Link } from "react-router-dom";

import { formatShortDate } from "@/components/calendar/calendar-shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceNotifications } from "@/hooks/use-workspace-notifications";
import { NOTIFICATION_LABELS, type WorkspaceNotification } from "@/lib/twigs/notifications";
import { cn } from "@/lib/utils";

const KIND_TEXT: Record<WorkspaceNotification["kind"], string> = {
  overdue: "text-destructive",
  today: "text-foreground",
  soon: "text-muted-foreground",
};

/**
 * What is late or due soon, computed from the twigs while the app is open. Push and email
 * need a server; this does not, so it is the half that can be honest today.
 */
export function NotificationBell() {
  const { notifications, urgentCount, isLoading, refresh } = useWorkspaceNotifications();

  return (
    <DropdownMenu
      onOpenChange={(isOpen) => {
        if (isOpen) {
          void refresh();
        }
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              urgentCount
                ? `Notifications, ${urgentCount} needing attention`
                : "Notifications, nothing due"
            }
            className="relative shrink-0"
          />
        }
      >
        <Bell className="size-4" />
        {urgentCount ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] font-semibold leading-4 text-white"
          >
            {urgentCount > 9 ? "9+" : urgentCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Due and overdue</DropdownMenuLabel>

          {isLoading ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading...</p>
          ) : null}

          {!isLoading && !notifications.length ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Nothing is due in the next week.
            </p>
          ) : null}

          {notifications.map((item) => (
            <div key={item.id} className="grid gap-0.5 px-2 py-1.5">
              <p className="truncate text-xs font-medium">{item.title}</p>
              <p className={cn("text-[0.68rem]", KIND_TEXT[item.kind])}>
                {NOTIFICATION_LABELS[item.kind]} &middot; {formatShortDate(item.dueDate)}
                {item.dueTime ? ` at ${item.dueTime}` : ""} &middot; {item.branchName}
              </p>
            </div>
          ))}

          <DropdownMenuSeparator />
          <Button variant="ghost" size="sm" className="w-full" render={<Link to="/calendar" />}>
            Open calendar
          </Button>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
