import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type MarketingEyebrowProps = {
  icon: LucideIcon;
  children: ReactNode;
};

/** The small pill above a page heading. */
export function MarketingEyebrow({ icon: Icon, children }: MarketingEyebrowProps) {
  return (
    <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="size-3.5" />
      {children}
    </p>
  );
}
