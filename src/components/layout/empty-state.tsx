import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** What to do about it: usually one button. */
  action?: ReactNode;
  className?: string;
};

/** What an empty list says: what would be here, and how to put something there. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="grid gap-1">
        <p className="text-heading text-foreground">{title}</p>
        {description ? (
          <p className="max-w-[42ch] text-body text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
