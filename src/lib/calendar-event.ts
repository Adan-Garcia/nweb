import { z } from "zod";

export const EVENT_COLOR_OPTIONS = [
  "Math",
  "History",
  "Physics",
  "GroupWork",
  "Chemistry",
] as const;

export const EVENT_STATUS_OPTIONS = ["incomplete", "inprogress", "complete"] as const;

export const calendarEventSchema = z.object({
  id: z.number(),
  title: z.string(),
  date: z.string(),
  time: z.string(),
  color: z.enum(EVENT_COLOR_OPTIONS),
  status: z.enum(EVENT_STATUS_OPTIONS),
});

export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type EventColor = CalendarEvent["color"];
export type EventStatus = CalendarEvent["status"];
