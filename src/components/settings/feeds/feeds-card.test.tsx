import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { defaultFeedSettings, type Feed } from "@/lib/feeds/feed-model";

import { FeedsCard } from "./feeds-card";

function makeFeed(overrides: Partial<Feed> = {}, settings: Partial<Feed["settings"]> = {}): Feed {
  return {
    id: "feed-1",
    createdAt: 0,
    updatedAt: 0,
    lastFetchedAt: null,
    lastError: null,
    lastCount: null,
    settings: {
      ...defaultFeedSettings(),
      name: "myCourses",
      url: "https://mycourses.example.edu/d2l/le/calendar/feed/user/feed.ics?token=secret",
      ...settings,
    },
    ...overrides,
  };
}

function setup(overrides: Partial<Parameters<typeof FeedsCard>[0]> = {}) {
  const props = {
    feeds: [makeFeed()],
    isLoading: false,
    busyFeedId: null,
    onAdd: vi.fn(),
    onEdit: vi.fn(),
    onRefresh: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };

  render(<FeedsCard {...props} />);

  return props;
}

describe("FeedsCard", () => {
  it("offers to add the first calendar when there are none", async () => {
    const user = userEvent.setup();
    const props = setup({ feeds: [] });

    expect(screen.getByText("No calendars yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a calendar" }));

    expect(props.onAdd).toHaveBeenCalled();
  });

  it("says it is loading rather than that there are none", () => {
    setup({ feeds: [], isLoading: true });

    expect(screen.getByText("Loading calendars…")).toBeInTheDocument();
    expect(screen.queryByText("No calendars yet")).not.toBeInTheDocument();
  });

  it("shows where a feed is from by host only, and how it last went", () => {
    setup({
      feeds: [
        makeFeed(),
        makeFeed(
          {
            id: "feed-2",
            lastFetchedAt: Date.now() - 60 * 60_000,
            lastCount: 42,
            lastError: "blocked",
          },
          { name: "Canvas" },
        ),
        makeFeed({ id: "feed-3" }, { name: "Fall.ics", url: "" }),
      ],
    });

    expect(screen.getAllByText(/From mycourses\.example\.edu/)).toHaveLength(2);
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Not refreshed yet/)).toHaveLength(2);
    expect(screen.getByText(/Updated about 1 hour ago · 42 events/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("does not let browsers read it");
    expect(screen.getByText(/Imported from a file/)).toBeInTheDocument();
  });

  it("refreshes, edits and adds from the list, and refreshes only a subscription", async () => {
    const user = userEvent.setup();
    const file = makeFeed({ id: "file" }, { name: "Fall.ics", url: "" });
    const props = setup({ feeds: [makeFeed(), file] });

    expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await user.click(screen.getByRole("button", { name: "Edit Fall.ics" }));
    await user.click(screen.getByRole("button", { name: "Add a calendar" }));

    expect(props.onRefresh).toHaveBeenCalledWith(props.feeds[0]);
    expect(props.onEdit).toHaveBeenCalledWith(file);
    expect(props.onAdd).toHaveBeenCalled();
  });

  it("holds a feed's buttons while it is busy", () => {
    setup({ busyFeedId: "feed-1" });

    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove myCourses" })).toBeDisabled();
  });

  it("asks what to do with a removed feed's tasks", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("button", { name: "Remove myCourses" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Keep its tasks" }),
    );
    expect(props.onRemove).toHaveBeenLastCalledWith(props.feeds[0], false);

    await user.click(screen.getByRole("button", { name: "Remove myCourses" }));
    await user.click(screen.getByRole("button", { name: "Remove its tasks too" }));
    expect(props.onRemove).toHaveBeenLastCalledWith(props.feeds[0], true);

    await user.click(screen.getByRole("button", { name: "Remove myCourses" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onRemove).toHaveBeenCalledTimes(2);
  });
});
