import type { ReactNode } from "react";

import { BrandIcon } from "@/components/brand-icon";
import { ThemeMenu } from "@/components/theme-menu";
import { cn } from "@/lib/utils";

type CenteredScreenProps = {
  children: ReactNode;
  className?: string;
};

/**
 * A screen that stands on its own — the lock, a rekey to finish, onboarding — centred, with
 * the brand above it and the theme within reach.
 */
export function CenteredScreen({ children, className }: CenteredScreenProps) {
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-4 py-10 text-foreground">
      <ThemeMenu className="absolute top-4 right-4" />
      <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <BrandIcon className="size-5" />
      </span>
      <div className={cn("w-full max-w-md", className)}>{children}</div>
    </main>
  );
}
