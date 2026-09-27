import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Above the title: a breadcrumb, a path, a date. */
  eyebrow?: ReactNode;
  /** The page's primary actions, at the end of the title row. */
  actions?: ReactNode;
  /** Below the title: tabs, filters, a view switcher. */
  children?: ReactNode;
  className?: string;
};

/**
 * The header every workspace page opens with, so the title, what the page is for and what
 * can be done on it are in the same place on every screen.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-6 grid gap-4", className)}>
      {eyebrow ? <div className="text-caption text-muted-foreground">{eyebrow}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-title text-foreground">{title}</h1>
          {description ? (
            <p className="max-w-[65ch] text-body text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
