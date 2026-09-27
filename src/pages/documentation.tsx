import { BookOpen } from "lucide-react";

import { BulletListCard } from "@/components/marketing/bullet-list-card";
import { HIERARCHY_LEVELS, ROADMAP_AREAS } from "@/components/marketing/documentation-content";
import { HierarchyLevelCard } from "@/components/marketing/hierarchy-level-card";
import { MarketingEyebrow } from "@/components/marketing/marketing-eyebrow";
import { MarketingPage } from "@/components/marketing/marketing-page";

export function DocumentationPage() {
  return (
    <MarketingPage activeHref="/documentation">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10 text-left">
          <MarketingEyebrow icon={BookOpen}>Product Documentation</MarketingEyebrow>
          <h1 className="mb-3 text-display">Build with the same structure as your study flow</h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            This guide mirrors the planner model shown in the app and combines your current
            implementation roadmap so new contributors can onboard quickly.
          </p>
        </div>

        <div className="mb-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {HIERARCHY_LEVELS.map((level) => (
            <HierarchyLevelCard key={level.name} level={level} />
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {ROADMAP_AREAS.map((section) => (
            <BulletListCard
              key={section.area}
              title={section.area}
              icon={section.icon}
              description="Prioritized from your current Todo roadmap."
              items={section.items}
            />
          ))}
        </div>
      </div>
    </MarketingPage>
  );
}
