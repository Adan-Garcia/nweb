import { AlertTriangle, BookOpenText, CalendarClock, ListChecks } from "lucide-react";

import { DashboardStatCard } from "@/components/dashboard/dashboard-stat-card";

type DashboardStatsProps = {
  dueToday: number;
  upcoming: number;
  overdue: number;
  notesUpdated: number;
};

export function DashboardStats({ dueToday, upcoming, overdue, notesUpdated }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <DashboardStatCard
        title="Due Today"
        icon={CalendarClock}
        value={dueToday}
        caption="Events on today's date"
      />
      <DashboardStatCard
        title="Upcoming (7 days)"
        icon={ListChecks}
        value={upcoming}
        caption="Incomplete items scheduled soon"
      />
      <DashboardStatCard
        title="Overdue"
        icon={AlertTriangle}
        value={overdue}
        caption="Incomplete events before today"
        isAlert
      />
      <DashboardStatCard
        title="Notes Updated"
        icon={BookOpenText}
        value={notesUpdated}
        caption="Edited in the last 7 days"
      />
    </div>
  );
}
