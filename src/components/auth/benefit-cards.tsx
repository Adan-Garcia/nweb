import type { ReactNode } from "react";

export type Benefit = {
  icon: ReactNode;
  title: string;
  copy: string;
  /** Marks a benefit the app does not deliver yet, so the card says so instead of implying it. */
  comingSoon?: boolean;
};

type BenefitCardsProps = {
  benefits: Benefit[];
  label: string;
};

/** A two-column grid of small icon + title + description cards (one column on phones). */
export function BenefitCards({ benefits, label }: BenefitCardsProps) {
  return (
    <div className="mt-8 grid grid-cols-2 gap-[0.9rem] max-[561px]:grid-cols-1" aria-label={label}>
      {benefits.map((benefit) => (
        <div
          key={benefit.title}
          className={
            "flex items-start gap-[0.85rem] rounded-[1rem] border border-[oklch(0.86_0.015_286/0.72)] " +
            "bg-[oklch(1_0_0/0.64)] px-4 py-[0.95rem] backdrop-blur-[6px] " +
            "dark:border-[oklch(0.35_0.01_286/0.9)] dark:bg-[oklch(0.18_0.01_286/0.72)]"
          }
        >
          <span
            className={
              "inline-flex size-8 flex-none items-center justify-center rounded-[0.75rem] " +
              "bg-[oklch(0.95_0.02_18)] text-[oklch(0.56_0.18_18)] " +
              "dark:bg-[oklch(0.28_0.02_286)] dark:text-[oklch(0.92_0.02_18)]"
            }
          >
            {benefit.icon}
          </span>
          <div className="w-full">
            <p className="m-0 flex flex-wrap items-center gap-2 font-semibold text-(--text-h)">
              {benefit.title}
              {benefit.comingSoon ? (
                <span className="rounded-full bg-muted px-2 py-[0.1rem] text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
                  Coming soon
                </span>
              ) : null}
            </p>
            <p className="mt-[0.2rem]! text-[0.92rem] text-[oklch(0.49_0.02_286)] dark:text-[oklch(0.8_0.015_286)]">
              {benefit.copy}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
