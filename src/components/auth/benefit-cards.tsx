import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Benefit = {
  icon: ReactNode;
  title: string;
  copy: string;
};

type BenefitCardsProps = {
  benefits: Benefit[];
  label: string;
  className?: string;
};

/** Small icon + title + description cards; one column on a phone, more as there is room. */
export function BenefitCards({ benefits, label, className }: BenefitCardsProps) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)} aria-label={label}>
      {benefits.map((benefit) => (
        <div key={benefit.title} className="flex items-start gap-3 rounded-lg border bg-card p-4">
          <span className="inline-flex size-8 flex-none items-center justify-center rounded-md bg-brand-soft text-primary">
            {benefit.icon}
          </span>
          <div className="grid gap-0.5">
            <p className="text-heading">{benefit.title}</p>
            <p className="text-body text-muted-foreground">{benefit.copy}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
