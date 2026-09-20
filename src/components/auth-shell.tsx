import type { ReactNode } from "react";

import { AuthBrand } from "@/components/auth/auth-brand";
import { AUTH_PAGE } from "@/components/auth/auth-layout";
import { AuthThemeToggle } from "@/components/auth/auth-theme-toggle";
import { type Benefit, BenefitCards } from "@/components/auth/benefit-cards";
import { useThemeMode } from "@/hooks/use-theme-mode";

const SHELL =
  "relative grid min-h-[min(740px,calc(100svh_-_4rem))] grid-cols-[1fr_1.05fr] overflow-hidden " +
  "rounded-[28px] border-[3.5px] border-border " +
  "bg-[radial-gradient(circle_at_16%_16%,oklch(0.89_0.08_28/0.45),transparent_42%),radial-gradient(circle_at_84%_10%,oklch(0.86_0.06_210/0.32),transparent_40%),linear-gradient(155deg,oklch(0.995_0.004_270),oklch(0.97_0.006_275))] " +
  "dark:bg-[radial-gradient(circle_at_16%_16%,oklch(0.42_0.08_24/0.22),transparent_42%),radial-gradient(circle_at_88%_10%,oklch(0.4_0.06_210/0.2),transparent_40%),linear-gradient(160deg,oklch(0.18_0.01_286),oklch(0.14_0.01_286))] " +
  "after:pointer-events-none after:absolute after:-right-24 after:-bottom-20 after:size-64 after:rounded-full after:content-[''] " +
  "after:bg-[radial-gradient(circle,oklch(0.6_0.16_18/0.12),transparent_68%)] " +
  "max-[961px]:min-h-auto max-[961px]:grid-cols-1 max-[961px]:rounded-[22px] " +
  "max-[561px]:min-h-svh max-[561px]:rounded-none max-[561px]:border-x-0";

const BRAND_COLUMN =
  "flex flex-col justify-between border-r border-r-[oklch(0.84_0.02_286/0.5)] p-[clamp(1.4rem,4vw,3rem)] text-left " +
  "bg-[linear-gradient(180deg,oklch(1_0_0/0.52),oklch(0.98_0.012_286/0.18))] " +
  "dark:border-r-[oklch(0.35_0.01_286/0.9)] dark:bg-[linear-gradient(180deg,oklch(0.18_0.01_286/0.74),oklch(0.14_0.01_286/0.35))] " +
  "max-[961px]:gap-8 max-[961px]:border-r-0";

const COPY_TEXT = "m-0 max-w-[38ch] text-[oklch(0.48_0.02_286)] dark:text-[oklch(0.8_0.015_286)]";

type AuthShellProps = {
  formAriaLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  form: ReactNode;
  benefits?: Benefit[];
  brandFooter?: ReactNode;
};

/** The split auth layout: brand and benefits on the left, the form on the right. */
export function AuthShell({
  formAriaLabel,
  eyebrow,
  title,
  description,
  form,
  benefits,
  brandFooter,
}: AuthShellProps) {
  const { isDark, toggleTheme } = useThemeMode();

  return (
    <main className={AUTH_PAGE}>
      <AuthThemeToggle isDark={isDark} onToggle={toggleTheme} />

      <section className={SHELL}>
        <aside className={BRAND_COLUMN}>
          <AuthBrand />

          <div className="mt-7 grid gap-4">
            <p className={`${COPY_TEXT} min-w-full text-[0.72rem] tracking-[0.14em] uppercase`}>
              {eyebrow}
            </p>
            <h1 className="m-0! max-w-[14ch] text-[clamp(2rem,4.8vw,3.4rem)]! leading-[1.02] tracking-[-0.05em]! max-[561px]:text-[clamp(1.7rem,8vw,2.3rem)]!">
              {title}
            </h1>
            <p className={COPY_TEXT}>{description}</p>
          </div>

          {benefits?.length ? (
            <BenefitCards benefits={benefits} label="Authentication benefits" />
          ) : null}

          {brandFooter}
        </aside>

        <section
          className="grid place-items-center p-[clamp(1.2rem,3vw,2.4rem)]"
          aria-label={formAriaLabel}
        >
          {form}
        </section>
      </section>
    </main>
  );
}
