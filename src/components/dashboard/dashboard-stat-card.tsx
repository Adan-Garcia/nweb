import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type DashboardStatCardProps = {
  title: string;
  icon: LucideIcon;
  value: number;
  caption: string;
  /** Draws the number in the warning colour when it is not zero. */
  isAlert?: boolean;
};

export function DashboardStatCard({
  title,
  icon: Icon,
  value,
  caption,
  isAlert = false,
}: DashboardStatCardProps) {
  return (
    <div className="grid gap-1 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <p className="text-caption font-medium">{title}</p>
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <p
        className={cn(
          "text-title tabular-nums",
          isAlert && value > 0 ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="text-caption text-muted-foreground">{caption}</p>
    </div>
  );
}
