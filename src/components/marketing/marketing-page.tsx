import type { ReactNode } from "react";

import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";

type MarketingPageProps = {
  activeHref?: string;
  children: ReactNode;
};

/** Page chrome for the public pages: header, content and footer. */
export function MarketingPage({ activeHref, children }: MarketingPageProps) {
  return (
    <div className="flex min-h-svh w-full flex-col bg-background text-foreground">
      <MarketingHeader activeHref={activeHref} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
