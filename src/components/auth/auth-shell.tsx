import type { ReactNode } from "react";

import { AuthLayout } from "@/components/auth/auth-layout";
import { type Benefit, BenefitCards } from "@/components/auth/benefit-cards";

type AuthShellProps = {
  formAriaLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  form: ReactNode;
  benefits?: Benefit[];
  brandFooter?: ReactNode;
};

/** The split auth layout: what this is and why on one side, the form on the other. */
export function AuthShell({
  formAriaLabel,
  eyebrow,
  title,
  description,
  form,
  benefits,
  brandFooter,
}: AuthShellProps) {
  return (
    <AuthLayout
      formAriaLabel={formAriaLabel}
      aside={
        <div className="grid gap-8">
          <div className="grid max-w-[40ch] gap-3">
            <p className="text-caption font-medium tracking-wider text-muted-foreground uppercase">
              {eyebrow}
            </p>
            <h1 className="text-display">{title}</h1>
            <p className="text-body text-muted-foreground">{description}</p>
          </div>

          {benefits?.length ? (
            <BenefitCards
              benefits={benefits}
              label="Authentication benefits"
              className="xl:grid-cols-2 lg:grid-cols-1"
            />
          ) : null}

          {brandFooter}
        </div>
      }
    >
      {form}
    </AuthLayout>
  );
}
