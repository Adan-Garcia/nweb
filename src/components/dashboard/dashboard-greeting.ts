import { format } from "date-fns";

/** "Good morning · Sunday, September 27": the line above the dashboard's title. */
export function dashboardGreeting(now: Date): string {
  const hour = now.getHours();
  const part = hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  return `Good ${part} · ${format(now, "EEEE, MMMM d")}`;
}
