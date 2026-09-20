import { z } from "zod";

import {
  EVENT_COLOR_OPTIONS,
  EVENT_STATUS_OPTIONS,
  type CalendarEvent,
  type EventColor,
} from "@/lib/calendar-event";

export const EVENT_COLORS: Record<EventColor, string> = {
  Math: "bg-emerald-500",
  History: "bg-rose-500",
  Physics: "bg-sky-500",
  GroupWork: "bg-amber-500",
  Chemistry: "bg-violet-500",
};

export const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: 1,
    title: "Math Study Session",
    date: "2026-04-16",
    time: "3:30 PM",
    color: "Math",
    status: "incomplete",
  },
  {
    id: 2,
    title: "History Essay Due",
    date: "2026-04-18",
    time: "11:59 PM",
    color: "History",
    status: "inprogress",
  },
  {
    id: 3,
    title: "Physics Lab",
    date: "2026-04-21",
    time: "9:00 AM",
    color: "Physics",
    status: "incomplete",
  },
  {
    id: 4,
    title: "Team Project Check-in",
    date: "2026-04-23",
    time: "1:15 PM",
    color: "GroupWork",
    status: "complete",
  },
  {
    id: 5,
    title: "Chemistry Quiz",
    date: "2026-04-27",
    time: "10:00 AM",
    color: "Chemistry",
    status: "inprogress",
  },
];

export const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const statusOrder: CalendarEvent["status"][] = [...EVENT_STATUS_OPTIONS];

export const eventFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
    .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), {
      message: "Enter a valid date",
    }),
  time: z.string().trim().min(1, "Time is required"),
  color: z.enum(EVENT_COLOR_OPTIONS),
  status: z.enum(EVENT_STATUS_OPTIONS),
});

export type EventFormValues = z.infer<typeof eventFormSchema>;

export const STATUS_META: Record<
  CalendarEvent["status"],
  { label: string; track: string }
> = {
  incomplete: {
    label: "Todo",
    track: "bg-slate-300/80 dark:bg-slate-700",
  },
  inprogress: {
    label: "Started",
    track: "bg-amber-300/80 dark:bg-amber-700/80",
  },
  complete: {
    label: "Done",
    track: "bg-emerald-300/80 dark:bg-emerald-700/80",
  },
};

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfWeek(date: Date) {
  const value = new Date(date);
  value.setDate(value.getDate() - value.getDay());
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function formatHumanDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
