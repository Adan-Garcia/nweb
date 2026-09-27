import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type MarketingCalloutProps = {
  title: string;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
};

/** A bordered call-out with a heading and a paragraph of copy. */
export function MarketingCallout({
  title,
  icon: Icon,
  className,
  children,
}: MarketingCalloutProps) {
  return (
    <div className={cn("rounded-lg border bg-card p-5 sm:p-6", className)}>
      <h2 className={cn("mb-2 text-heading", Icon && "flex items-center gap-2")}>
        {Icon ? <Icon className="size-5 text-primary" /> : null}
        {title}
      </h2>
      <p className="text-body text-muted-foreground">{children}</p>
    </div>
  );
}
