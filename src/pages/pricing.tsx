import { ShieldCheck, Sparkles } from "lucide-react";

import { MarketingCallout } from "@/components/marketing/marketing-callout";
import { MarketingEyebrow } from "@/components/marketing/marketing-eyebrow";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { PricingTierCard } from "@/components/marketing/pricing-tier-card";
import { PRICING_TIERS } from "@/components/marketing/pricing-tiers";

export function PricingPage() {
  return (
    <MarketingPage activeHref="/pricing">
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <MarketingEyebrow icon={Sparkles}>Simple and transparent</MarketingEyebrow>
          <h1 className="mb-3 text-4xl font-bold sm:text-5xl">
            Pricing that scales from solo study to team collaboration
          </h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            The current launch includes a free beta. Dependent on user feedback and demand, we may
            introduce paid plans in the future to support the project and provide access to faster
            servers and priority support, but the core planner and all features will remain free and
            open source on GitHub. if the service becomes popular enough the paid plans will help
            support the continuation of the free offering, but if not the product will continue to
            be free and open source with no feature restrictions for self-hosting and local-first
            use.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {PRICING_TIERS.map((tier) => (
            <PricingTierCard key={tier.name} tier={tier} />
          ))}
        </div>

        <MarketingCallout
          icon={ShieldCheck}
          title="Security included on every tier"
          className="mt-10 text-left"
        >
          Every plan follows the same encryption-first model: local-first data handling, secure key
          management, and access control designed for shared academic workspaces.
        </MarketingCallout>
        <MarketingCallout
          icon={ShieldCheck}
          title="Forever open source"
          className="mt-10 text-left"
        >
          The core planner and all features will remain free and open source on GitHub, with paid
          plans supporting the project and providing access to faster servers and priority support.
          But the product will always support self-hosting and local-first use for students who
          prefer to keep their data private with no feature restrictions.
        </MarketingCallout>
      </section>
    </MarketingPage>
  );
}
