import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { NextPriorityCard } from "@/components/dashboard/next-priority-card";
import { RecentNotesCard } from "@/components/dashboard/recent-notes-card";
import { UpcomingDeadlinesCard } from "@/components/dashboard/upcoming-deadlines-card";
import type { useDashboardData } from "@/components/dashboard/use-dashboard-data";
import type { DashboardCardId } from "@/lib/preferences-model";

type DashboardSectionProps = {
  id: DashboardCardId;
  dashboard: ReturnType<typeof useDashboardData>;
};

/**
 * One of the dashboard's cards, by id. The ids and their order come from the preferences,
 * so this is the registry that turns someone's arrangement into the page.
 */
export function DashboardSection({ id, dashboard }: DashboardSectionProps) {
  switch (id) {
    case "next-priority":
      return <NextPriorityCard event={dashboard.nextPriority} />;
    case "stats":
      return (
        <DashboardStats
          dueToday={dashboard.dueToday.length}
          upcoming={dashboard.upcomingEvents.length}
          overdue={dashboard.overdueCount}
          notesUpdated={dashboard.notesUpdatedThisWeekCount}
        />
      );
    case "upcoming":
      return (
        <UpcomingDeadlinesCard snapshot={dashboard.snapshot} events={dashboard.upcomingPreview} />
      );
    case "recent-notes":
      return (
        <RecentNotesCard
          snapshot={dashboard.snapshot}
          notes={dashboard.recentNotes}
          isLoading={dashboard.isNotesLoading}
        />
      );
  }
}
