import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { DatedTwig } from "@/components/calendar/calendar-shared";
import { makeSnapshot, makeTwig } from "@/test/workspace-fixtures";

import { CalendarGridCard } from "./calendar-grid-card";
import { buildWeekDates, groupEventsByDate } from "./calendar-views";

const event = (id: number, dueDate: string, overrides: Partial<DatedTwig> = {}): DatedTwig => ({
  ...makeTwig({ id: String(id), title: `Event ${id}`, dueTime: "9:00 AM" }),
  dueDate,
  ...overrides,
});

// The week of Sunday 2026-04-12 to Saturday 2026-04-18; "today" is Thursday the 16th.
const week = buildWeekDates(new Date(2026, 3, 16));

function setup(overrides: Partial<ComponentProps<typeof CalendarGridCard>> = {}) {
  const props: ComponentProps<typeof CalendarGridCard> = {
    snapshot: makeSnapshot(),
    viewMode: "week",
    onViewModeChange: vi.fn(),
    monthLabel: "April 2026",
    weekLabel: "Apr 12-18, 2026",
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onToday: vi.fn(),
    visibleDates: week,
    currentMonth: new Date(2026, 3, 1),
    today: new Date(2026, 3, 16),
    selectedDateKey: null,
    eventsByDate: groupEventsByDate([
      event(1, "2026-04-14"),
      event(2, "2026-04-16"),
      event(3, "2026-04-16", { status: "complete" }),
      event(4, "2026-04-16"),
      event(5, "2026-04-16"),
    ]),
    onSelectDate: vi.fn(),
    ...overrides,
  };
  render(<CalendarGridCard {...props} />);
  return props;
}

describe("CalendarGridCard", () => {
  it("titles the card with the week or the month", () => {
    setup();
    expect(screen.getByText("Apr 12-18, 2026")).toBeInTheDocument();
  });

  it("titles the card with the month in month view", () => {
    setup({ viewMode: "month" });
    expect(screen.getByText("April 2026")).toBeInTheDocument();
  });

  it("lists the weekday headings and one button per visible day", () => {
    setup();
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { name: /^\d+/ })).toHaveLength(7);
  });

  it("switches view, navigates, and jumps to today", async () => {
    const user = userEvent.setup();
    const props = setup();

    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Month" }));
    await user.click(screen.getByRole("button", { name: "Week" }));
    // The arrows say what they step by, which in week view is a week.
    await user.click(screen.getByRole("button", { name: "Previous week" }));
    await user.click(screen.getByRole("button", { name: "Next week" }));
    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(props.onViewModeChange).toHaveBeenNthCalledWith(1, "month");
    expect(props.onViewModeChange).toHaveBeenNthCalledWith(2, "week");
    expect(props.onPrevious).toHaveBeenCalledOnce();
    expect(props.onNext).toHaveBeenCalledOnce();
    expect(props.onToday).toHaveBeenCalledOnce();
  });

  it("reports the day that was clicked", async () => {
    const user = userEvent.setup();
    const onSelectDate = vi.fn<(date: Date) => void>();
    setup({ onSelectDate });

    await user.click(screen.getByRole("button", { name: /^14/ }));

    expect(onSelectDate).toHaveBeenCalledOnce();
    expect(onSelectDate.mock.calls[0][0].getDate()).toBe(14);
  });

  it("shows up to two events per day and counts the rest", () => {
    setup();
    const thursday = screen.getByRole("button", { name: /^16/ });

    expect(within(thursday).getByText("Event 2")).toBeInTheDocument();
    expect(within(thursday).getByText("Event 3")).toBeInTheDocument();
    expect(within(thursday).queryByText("Event 4")).not.toBeInTheDocument();
    expect(within(thursday).getByText("+2 more")).toBeInTheDocument();
  });

  it("names the arrows after the month in month view", () => {
    setup({ viewMode: "month" });
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeInTheDocument();
  });

  it("strikes through completed events", () => {
    setup();
    const thursday = screen.getByRole("button", { name: /^16/ });
    expect(within(thursday).getByText("Event 3").parentElement).toHaveClass("line-through");
    expect(within(thursday).getByText("Event 2").parentElement).not.toHaveClass("line-through");
  });

  it("marks the selected day and today, and mutes days outside the month", () => {
    setup({ selectedDateKey: "2026-04-14", visibleDates: buildWeekDates(new Date(2026, 3, 1)) });
    // The week of April 1 starts in March.
    expect(screen.getByRole("button", { name: /^29/ })).toHaveClass("bg-muted/30");
    expect(screen.getByRole("button", { name: /^1(?!\d)/ })).toHaveClass("bg-card");
  });

  it("highlights the selected day, and says which it is", () => {
    setup({ selectedDateKey: "2026-04-14" });
    expect(screen.getByRole("button", { name: /^14/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^14/ })).toHaveClass("bg-brand-soft");
    expect(screen.getByRole("button", { name: /^15/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("puts today's date in the accent", () => {
    setup();
    expect(within(screen.getByRole("button", { name: /^16/ })).getByText("16")).toHaveClass(
      "bg-primary",
    );
  });
});
