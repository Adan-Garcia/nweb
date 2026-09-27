import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as cipher from "@/lib/crypto/cipher";
import { getNotesDb } from "@/lib/db/notes-db";
import { defaultFeedSettings } from "@/lib/feeds/feed-model";
import * as feedStorage from "@/lib/feeds/feed-storage";
import { getFeed, listFeeds, saveFeed } from "@/lib/feeds/feed-storage";
import { listTwigs } from "@/lib/twigs/twig-storage";
import { server } from "@/test/server";

import { describeReport, useCalendarFeeds } from "./use-calendar-feeds";

const toast = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  notifyInfo: vi.fn(),
}));

vi.mock("@/lib/toast", () => toast);

const FEED = "https://calendar.example.edu/feed.ics";
const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:quiz",
  "SUMMARY:Quiz",
  "DTSTART:20990101T150000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const settings = { ...defaultFeedSettings(), name: "Courses", url: FEED };

async function renderLoaded() {
  const view = renderHook(() => useCalendarFeeds());

  await waitFor(() => expect(view.result.current.isLoading).toBe(false));

  return view;
}

beforeEach(async () => {
  const database = await getNotesDb();

  await Promise.all((["feeds", "twigs"] as const).map((store) => database.clear(store)));
  toast.notifySuccess.mockClear();
  toast.notifyError.mockClear();
});

describe("describeReport", () => {
  it("says what changed, or that nothing did", () => {
    expect(describeReport({ added: 2, updated: 1, removed: 3, total: 0, excluded: 0 })).toBe(
      "2 new, 1 changed, 3 removed.",
    );
    expect(describeReport({ added: 0, updated: 0, removed: 0, total: 0, excluded: 0 })).toBe(
      "Nothing had changed.",
    );
  });
});

describe("useCalendarFeeds", () => {
  it("lists the feeds and the courses they may file into", async () => {
    await saveFeed(settings);

    const { result } = await renderLoaded();

    expect(result.current.feeds.map((feed) => feed.settings.name)).toEqual(["Courses"]);
    expect(result.current.branchOptions.length).toBeGreaterThanOrEqual(0);
  });

  it("refreshes a feed and says what came in", async () => {
    server.use(http.get(FEED, () => HttpResponse.text(ICS)));
    const feed = await saveFeed(settings);
    const { result } = await renderLoaded();

    await act(() => result.current.refresh(feed));

    expect(toast.notifySuccess).toHaveBeenCalledWith("Courses is up to date", "1 new.");
    expect(result.current.feeds[0].lastCount).toBe(1);
    expect(result.current.busyFeedId).toBeNull();
  });

  it("says why a refresh failed", async () => {
    server.use(http.get(FEED, () => new HttpResponse(null, { status: 404 })));
    const feed = await saveFeed(settings);
    const { result } = await renderLoaded();

    await act(() => result.current.refresh(feed));

    expect(toast.notifyError).toHaveBeenCalledWith(
      "Could not refresh Courses",
      expect.stringContaining("could not be reached"),
    );
  });

  it("imports what the editor read after a save, or just re-lists a settings change", async () => {
    const feed = await saveFeed({ ...settings, url: "" });
    const { result } = await renderLoaded();

    await act(() => result.current.afterSave(feed));
    expect(toast.notifySuccess).not.toHaveBeenCalled();

    await act(() => result.current.afterSave(feed, ICS));
    expect(await listTwigs()).toHaveLength(1);
  });

  it("removes a feed with its tasks, or keeps them", async () => {
    server.use(http.get(FEED, () => HttpResponse.text(ICS)));
    const first = await saveFeed(settings);
    const second = await saveFeed({ ...settings, name: "Other" });
    const { result } = await renderLoaded();

    await act(() => result.current.refresh(first));
    await act(() => result.current.remove(first, true));

    expect(toast.notifySuccess).toHaveBeenLastCalledWith(
      "Removed Courses",
      "1 tasks removed with it.",
    );
    expect(await listTwigs()).toEqual([]);

    await act(() => result.current.refresh(second));
    await act(() => result.current.remove(second, false));

    expect(toast.notifySuccess).toHaveBeenLastCalledWith("Removed Other", "Its tasks were kept.");
    expect(await listTwigs()).toHaveLength(1);
    expect(await listFeeds()).toEqual([]);
    expect(await getFeed(second.id)).toBeNull();
  });

  it("lists nothing on a locked workspace", async () => {
    vi.spyOn(feedStorage, "listFeeds").mockRejectedValueOnce(
      new cipher.CipherUnavailableError("aes-gcm"),
    );

    const { result } = await renderLoaded();

    expect(result.current.feeds).toEqual([]);
  });

  it("stops quietly when unmounted before the list arrives", async () => {
    const { result, unmount } = renderHook(() => useCalendarFeeds());

    unmount();
    await act(() => Promise.resolve());

    expect(result.current.isLoading).toBe(true);
  });
});
