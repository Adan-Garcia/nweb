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
        <div className="mx-auto mb-10 max-w-3xl text-left">
          <MarketingEyebrow icon={ShieldCheck}>Privacy Policy</MarketingEyebrow>
          <h1 className="mb-3 text-4xl font-bold sm:text-5xl">Your study data stays yours</h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            Cuervo Planner is an early beta that runs entirely in your browser. There is no server,
            no account, and nothing is collected. This page describes what the app does today, not
            what it is planned to do.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">Last updated: September 20, 2026</p>
        </div>

        <PlainLanguageBreakdown intro="Short version: everything stays in this browser, nothing is encrypted, and it is the only copy." />

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
          You can choose what you store, what you share, and where you run the app. If you have
          privacy questions or want data-related help, contact the project through the official
          Cuervo Planner support channels or repository issue tracker.
        </MarketingCallout>
      </section>
    </MarketingPage>
  );
}
