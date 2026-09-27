import { BookOpen } from "lucide-react";

import { BulletListCard } from "@/components/marketing/bullet-list-card";
import { FEATURE_AREAS, HIERARCHY_LEVELS } from "@/components/marketing/documentation-content";
import { HierarchyLevelCard } from "@/components/marketing/hierarchy-level-card";
import { MarketingEyebrow } from "@/components/marketing/marketing-eyebrow";
import { MarketingPage } from "@/components/marketing/marketing-page";

export function DocumentationPage() {
  return (
    <MarketingPage activeHref="/documentation">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10 text-left">
          <MarketingEyebrow icon={BookOpen}>Product Documentation</MarketingEyebrow>
          <h1 className="mb-3 text-display">How Cuervo Planner is organised, and what it does</h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            Everything you keep is filed the way a school year is: a workspace, its terms, their
            courses, and the tags, tasks, notes and files inside each course. Below that is what
            works today and what is still to come.
          </p>
        </div>

        <div className="mb-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {HIERARCHY_LEVELS.map((level) => (
            <HierarchyLevelCard key={level.name} level={level} />
          ))}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {FEATURE_AREAS.map((section) => (
            <BulletListCard
              key={section.area}
              title={section.area}
              icon={section.icon}
              description={section.description}
              items={section.items}
            />
          ))}
        </div>
      </div>
    </MarketingPage>
  );
}
