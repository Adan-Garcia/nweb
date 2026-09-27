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
        <div className="mb-10 max-w-3xl">
          <MarketingEyebrow icon={Sparkles}>Simple and transparent</MarketingEyebrow>
          <h1 className="mb-3 text-display">
            Free during the beta, and free to self-host for good
          </h1>
          <p className="text-lg text-muted-foreground">
            Every feature is free during the beta, which runs through 2027. Paid plans may follow if
            there is demand for them. They would pay for hosting — faster servers, more storage,
            quicker support — and never unlock a feature: the planner stays free and open source,
            with nothing held back from self-hosting or local-only use.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {PRICING_TIERS.map((tier) => (
            <PricingTierCard key={tier.name} tier={tier} />
          ))}
        </div>

        <MarketingCallout
          icon={ShieldCheck}
          title="How your data is handled today"
          className="mt-10 text-left"
        >
          Cuervo Planner runs entirely in your browser, encrypted under your passphrase, and uploads
          nothing unless you add a sync account. Then your notes are encrypted before they are
          synced, so the server stores what it cannot read. The paid plans are not available yet.
        </MarketingCallout>
        <MarketingCallout
          icon={ShieldCheck}
          title="Forever open source"
          className="mt-10 text-left"
        >
          The app and its sync server are MIT licensed on GitHub, and a Docker setup runs both. Host
          your own and you get every feature, with your data on a machine you control.
        </MarketingCallout>
      </section>
    </MarketingPage>
  );
}
