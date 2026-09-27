import { ShieldCheck } from "lucide-react";

import { BulletListCard } from "@/components/marketing/bullet-list-card";
import { MarketingCallout } from "@/components/marketing/marketing-callout";
import { MarketingEyebrow } from "@/components/marketing/marketing-eyebrow";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { PlainLanguageBreakdown } from "@/components/marketing/plain-language-breakdown";
import { POLICY_SECTIONS } from "@/components/marketing/privacy-content";

export function PrivacyPage() {
  return (
    <MarketingPage activeHref="/privacy">
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <MarketingEyebrow icon={ShieldCheck}>Privacy Policy</MarketingEyebrow>
          <h1 className="mb-3 text-display">Your study data stays yours</h1>
          <p className="text-lg text-muted-foreground">
            Cuervo Planner is an early beta. It runs in your browser and works without an account;
            an account is optional, and only exists when the app is connected to a server. This page
            describes what the app does today, not what it is planned to do.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">Last updated: September 27, 2026</p>
        </div>

        <PlainLanguageBreakdown intro="Short version: without an account nothing leaves this browser. Lock it to encrypt it, and if you sync, the server only ever holds what it cannot read." />

        <div className="grid gap-5 md:grid-cols-2">
          {POLICY_SECTIONS.map((section) => (
            <BulletListCard
              key={section.title}
              title={section.title}
              icon={section.icon}
              items={section.items}
            />
          ))}
        </div>

        <MarketingCallout title="Your choices and contact" className="mt-8">
          You choose whether to have an account, what you share and with whom, and where the app and
          its server run: both are open source and can be self-hosted. For privacy questions or help
          with your data, open an issue on the project's GitHub repository.
        </MarketingCallout>
      </section>
    </MarketingPage>
  );
}
