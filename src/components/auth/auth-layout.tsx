import type { ReactNode } from "react";

import { AuthBrand } from "@/components/auth/auth-brand";
import { ThemeMenu } from "@/components/theme/theme-menu";

type AuthLayoutProps = {
  /** The story: eyebrow, heading, copy. Beside the form on a wide screen, above it on a phone. */
  aside: ReactNode;
  /** The form, or whatever the page offers in its place. */
  children: ReactNode;
  formAriaLabel: string;
};

/** The auth pages' frame: a quiet panel that says what this is, and the form. */
export function AuthLayout({ aside, children, formAriaLabel }: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh w-full bg-background text-foreground lg:grid-cols-[1fr_1.1fr]">
      <aside className="flex flex-col gap-10 border-b bg-muted/40 p-6 sm:p-10 lg:justify-between lg:border-r lg:border-b-0 lg:p-12">
        <div className="flex items-center justify-between gap-4">
          <AuthBrand />
          <ThemeMenu className="lg:hidden" />
        </div>
        {aside}
      </aside>

      <main className="relative flex flex-col items-center justify-center p-6 sm:p-10">
        <ThemeMenu className="absolute top-6 right-6 hidden lg:inline-flex" />
        <section aria-label={formAriaLabel} className="grid w-full place-items-center">
          {children}
        </section>
      </main>
    </div>
  );
}
