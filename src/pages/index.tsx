import { ArrowRight } from "lucide-react";

import { LandingBenefits } from "@/components/marketing/landing-benefits";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { Button } from "@/components/ui/button";

export function IndexPage() {
  return (
    <MarketingPage>
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-12 sm:px-6 md:pt-24 lg:px-8">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-caption text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          Free beta · Open source · Works offline
        </p>
        <h1 className="max-w-[18ch] text-display">Cuervo Planner</h1>
        <p className="mt-4 max-w-[60ch] text-lg text-muted-foreground">
          A homework planner and note-taking app built with privacy in mind. Plan your classes,
          tasks and deadlines, and take notes as text or on an infinite canvas. It all lives in this
          browser unless you choose to sync it, and then the server only ever sees it encrypted. For
          more information, see our{" "}
          <a
            href="/privacy"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            privacy policy
          </a>
          .
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" onClick={() => (window.location.href = "/auth/")}>
            Get Started Now
            <ArrowRight className="size-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<a href="/documentation" />}
          >
            Read the docs
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8">
        <LandingBenefits />
      </section>
    </MarketingPage>
  );
}
