import { useState } from "react";

import { dashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { useDashboardData } from "@/components/dashboard/use-dashboard-data";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { useAppearance } from "@/hooks/use-appearance";
import { cn } from "@/lib/utils";

/** The two list cards sit side by side on a wide screen; the rest take the full row. */
const HALF_WIDTH = new Set(["upcoming", "recent-notes"]);

export function DashboardPage() {
  const dashboard = useDashboardData();
  const { preferences } = useAppearance();
  const [greeting] = useState(() => dashboardGreeting(new Date()));
  const cards = preferences.dashboardCards.filter((card) => card.visible);

  return (
    <PageContainer>
      <PageHeader
        eyebrow={greeting}
        title="Dashboard"
        description="Your overview of upcoming events and recent notes."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <div key={card.id} className={cn("min-w-0", !HALF_WIDTH.has(card.id) && "lg:col-span-2")}>
            <DashboardSection id={card.id} dashboard={dashboard} />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
