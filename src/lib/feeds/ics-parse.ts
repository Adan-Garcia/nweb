import { looksLikeIcs } from "@shared/feed-contract";

/**
 * Reading an iCalendar file (RFC 5545) into the few things a twig can hold.
 *
 * Deliberately a subset. A study calendar needs what an event is called, where it is, when
 * it is and whether it repeats; it does not need alarms, attendees or free/busy. Everything
 * else is read past rather than rejected, because a feed is written by somebody else's
 * server and one property this does not know about must not cost the whole calendar.
 *
 * A time is kept as the file wrote it — a date, a UTC instant, or a wall clock with its
 * zone — and turned into a due date only once the device's zone is known (`ics-time.ts`).
 */
export type IcsTime =
  | { kind: "date"; date: string }
  | { kind: "utc"; date: string; minutes: number }
  /** A wall clock. `timeZone` is the file's `TZID`, or empty for a floating time. */
  | { kind: "zoned"; date: string; minutes: number; timeZone: string };

export type IcsEvent = {
  uid: string;
  summary: string;
  description: string;
  location: string;
  categories: string[];
  start: IcsTime;
  end: IcsTime | null;
  /** The `RRULE` value as written, e.g. `FREQ=WEEKLY;BYDAY=TU`. */
  rrule: string | null;
  /** Occurrences the series skips, as date keys. */
  exdates: string[];
  /** Set on an event that replaces one occurrence of a series: the date it replaces. */
  recurrenceId: string | null;
  cancelled: boolean;
};

export type IcsCalendar = { name: string | null; events: IcsEvent[] };

/** A calendar bigger than this is not a study calendar, and would stall the tab. */
export const MAX_ICS_EVENTS = 10_000;

type IcsProperty = { name: string; params: Record<string, string>; value: string };

/** Folded lines are continued by a leading space or tab, which is dropped with the break. */
function unfold(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

/** Splits at the first colon that is not inside a quoted parameter value. */
function parseLine(line: string): IcsProperty | null {
  let quoted = false;
  let colon = -1;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      quoted = !quoted;
    } else if (char === ":" && !quoted) {
      colon = index;
      break;
    }
  }

  if (colon <= 0) {
    return null;
  }

  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};

  for (const param of rawParams) {
    const equals = param.indexOf("=");

    if (equals > 0) {
      params[param.slice(0, equals).toUpperCase()] = param.slice(equals + 1).replace(/^"|"$/g, "");
    }
  }

  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

/** TEXT values escape commas, semicolons, backslashes and line breaks. */
export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_match, char: string) =>
    char === "n" || char === "N" ? "\n" : char,
  );
}

/** Splits a TEXT list on the commas that are not escaped. */
function splitTextList(value: string): string[] {
  return value
    .split(/(?<!\\),/)
    .map((part) => unescapeText(part).trim())
    .filter(Boolean);
}

const DATE_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

/** One DATE or DATE-TIME value, or null for anything that is neither. */
export function parseIcsTime(value: string, params: Record<string, string> = {}): IcsTime | null {
  const trimmed = value.trim();
  const dateOnly = DATE_PATTERN.exec(trimmed);

  if (dateOnly) {
    return { kind: "date", date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}` };
  }

  const dateTime = DATE_TIME_PATTERN.exec(trimmed);

  if (!dateTime) {
    return null;
  }

  const [, year, month, day, hour, minute, , utc] = dateTime;
  const date = `${year}-${month}-${day}`;
  const minutes = Number(hour) * 60 + Number(minute);

  if (Number(hour) > 23 || Number(minute) > 59) {
    return null;
  }

  if (utc) {
    return { kind: "utc", date, minutes };
  }

  return { kind: "zoned", date, minutes, timeZone: params.TZID ?? "" };
}

type EventDraft = Partial<Omit<IcsEvent, "exdates" | "categories">> & {
  exdates: string[];
  categories: string[];
};

function emptyDraft(): EventDraft {
  return { exdates: [], categories: [] };
}

function applyProperty(draft: EventDraft, { name, params, value }: IcsProperty): void {
  switch (name) {
    case "UID":
      draft.uid = value.trim();
      break;
    case "SUMMARY":
      draft.summary = unescapeText(value).trim();
      break;
    case "DESCRIPTION":
      draft.description = unescapeText(value).trim();
      break;
    case "LOCATION":
      draft.location = unescapeText(value).trim();
      break;
    case "CATEGORIES":
      draft.categories.push(...splitTextList(value));
      break;
    case "DTSTART":
      draft.start = parseIcsTime(value, params) ?? undefined;
      break;
    case "DTEND":
    case "DUE":
      draft.end = parseIcsTime(value, params);
      break;
    case "RRULE":
      draft.rrule = value.trim();
      break;
    case "EXDATE":
      for (const part of value.split(",")) {
        const time = parseIcsTime(part, params);

        if (time) {
          draft.exdates.push(time.date);
        }
      }
      break;
    case "RECURRENCE-ID":
      draft.recurrenceId = parseIcsTime(value, params)?.date ?? null;
      break;
    case "STATUS":
      draft.cancelled = value.trim().toUpperCase() === "CANCELLED";
      break;
  }
}

/** An event needs a start to be placed; one without a UID gets one from what it says. */
function finishDraft(draft: EventDraft): IcsEvent | null {
  if (!draft.start) {
    return null;
  }

  const summary = draft.summary ?? "";

  return {
    uid: draft.uid || `${draft.start.date}:${summary}`,
    summary,
    description: draft.description ?? "",
    location: draft.location ?? "",
    categories: draft.categories,
    start: draft.start,
    end: draft.end ?? null,
    rrule: draft.rrule ?? null,
    exdates: draft.exdates,
    recurrenceId: draft.recurrenceId ?? null,
    cancelled: draft.cancelled ?? false,
  };
}

/**
 * Every event in a calendar, in file order. Throws when the text is not a calendar, so a
 * login page served in place of a feed is an error rather than an empty calendar that would
 * remove every task the feed had made.
 */
export function parseIcs(text: string): IcsCalendar {
  if (!looksLikeIcs(text)) {
    throw new Error("Not an iCalendar file.");
  }

  const events: IcsEvent[] = [];
  const stack: string[] = [];
  let name: string | null = null;
  let draft: EventDraft | null = null;

  for (const line of unfold(text)) {
    const property = parseLine(line);

    if (!property) {
      continue;
    }

    const component = property.value.trim().toUpperCase();

    if (property.name === "BEGIN") {
      stack.push(component);

      if (component === "VEVENT" && stack.length === 2) {
        draft = emptyDraft();
      }
    } else if (property.name === "END") {
      if (component === "VEVENT" && stack.length === 2 && draft) {
        const event = finishDraft(draft);

        if (event && events.length < MAX_ICS_EVENTS) {
          events.push(event);
        }

        draft = null;
      }

      stack.pop();
    } else if (draft && stack.length === 2) {
      // Only the event's own properties: an alarm nested inside it has a DESCRIPTION too.
      applyProperty(draft, property);
    } else if (stack.length === 1 && property.name === "X-WR-CALNAME") {
      name = unescapeText(property.value).trim() || null;
    }
  }

  return { name, events };
}
