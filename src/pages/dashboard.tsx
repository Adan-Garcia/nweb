import { AlertTriangle, BookOpenText, CalendarClock, ListChecks } from "lucide-react";

import { DashboardStatCard } from "@/components/dashboard/dashboard-stat-card";
import { NextPriorityCard } from "@/components/dashboard/next-priority-card";
import { RecentNotesCard } from "@/components/dashboard/recent-notes-card";
import { UpcomingDeadlinesCard } from "@/components/dashboard/upcoming-deadlines-card";
import { useDashboardData } from "@/components/dashboard/use-dashboard-data";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useThemeMode } from "@/hooks/use-theme-mode";

import "../App.css";

export function DashboardPage() {
  const { isDark, toggleTheme } = useThemeMode();
  const dashboard = useDashboardData();

  return (
    <WorkspaceShell isDark={isDark} onToggleTheme={toggleTheme}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-center gap-4">
          <div>
            <h1 className="text-4xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              Your overview of upcoming events and recent notes.
            </p>
          </div>
        </div>

        <NextPriorityCard event={dashboard.nextPriority} />

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardStatCard
            title="Due Today"
            icon={CalendarClock}
            value={dashboard.dueToday.length}
            caption="Events on today's date"
          />
          <DashboardStatCard
            title="Upcoming (7 days)"
            icon={ListChecks}
            value={dashboard.upcomingEvents.length}
            caption="Incomplete items scheduled soon"
          />
          <DashboardStatCard
            title="Overdue"
            icon={AlertTriangle}
            value={dashboard.overdueCount}
            caption="Incomplete events before today"
          />
          <DashboardStatCard
            title="Notes Updated"
            icon={BookOpenText}
            value={dashboard.notesUpdatedThisWeekCount}
            caption="Edited in the last 7 days"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <UpcomingDeadlinesCard events={dashboard.upcomingPreview} />
          <RecentNotesCard notes={dashboard.recentNotes} isLoading={dashboard.isNotesLoading} />
        </div>
      </div>
    </WorkspaceShell>
  );
}
