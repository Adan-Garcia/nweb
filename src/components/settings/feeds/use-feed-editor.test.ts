import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNotesDb } from "@/lib/db/notes-db";
import { defaultFeedSettings, type Feed } from "@/lib/feeds/feed-model";
import { listFeeds, saveFeed } from "@/lib/feeds/feed-storage";
import { server } from "@/test/server";

import { toFormValues } from "./feed-form";
import { type FeedSource, useFeedEditor } from "./use-feed-editor";

const FEED = "https://calendar.example.edu/feed.ics";
const ICS = "BEGIN:VCALENDAR\r\nX-WR-CALNAME:myCourses\r\nEND:VCALENDAR";

/** The message a failed read shows, or null when it did not fail. */
const errorOf = (source: FeedSource) => (source.state === "error" ? source.message : null);

function setup() {
  const onSaved = vi.fn<(feed: Feed, text?: string) => Promise<void>>(() => Promise.resolve());
  const view = renderHook(() => useFeedEditor({ onSaved }));

  return { ...view, onSaved };
}

beforeEach(async () => {
  await (await getNotesDb()).clear("feeds");
});

describe("useFeedEditor", () => {
  it("opens empty for a new feed, filled in for an existing one, and closes", async () => {
    const feed = await saveFeed({ ...defaultFeedSettings(), name: "Old", url: FEED });
    const { result } = setup();

    act(() => result.current.open(null));
    expect(result.current).toMatchObject({ isOpen: true, feed: null });

    act(() => result.current.open(feed));
    expect(result.current.form.getValues()).toEqual(toFormValues(feed));

    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it("reads a link, naming the feed after the calendar when it has no name yet", async () => {
    server.use(http.get(FEED, () => HttpResponse.text(ICS)));
    const { result } = setup();

    act(() => result.current.open(null));
    await act(() => result.current.loadUrl("webcal://calendar.example.edu/feed.ics"));

    expect(result.current.source).toEqual({ state: "ready", text: ICS, origin: FEED });
    expect(result.current.form.getValues("name")).toBe("myCourses");
  });

  it("keeps a name already typed, and falls back on the host for a calendar with none", async () => {
    server.use(http.get(FEED, () => HttpResponse.text("BEGIN:VCALENDAR\r\nEND:VCALENDAR")));
    const { result } = setup();

    act(() => result.current.open(null));
    await act(() => result.current.loadUrl(FEED));
    expect(result.current.form.getValues("name")).toBe("calendar.example.edu");

    act(() => result.current.form.setValue("name", "Mine"));
    await act(() => result.current.loadUrl(FEED));
    expect(result.current.form.getValues("name")).toBe("Mine");
  });

  it("says why a link could not be read", async () => {
    server.use(http.get(FEED, () => HttpResponse.text("<html>")));
    const { result } = setup();

    await act(() => result.current.loadUrl("ftp://nope"));
    expect(errorOf(result.current.source)).toContain("not a calendar address");

    await act(() => result.current.loadUrl(FEED));
    expect(errorOf(result.current.source)).toContain("did not return a calendar");
  });

  it("reads a file, and refuses one that is not a calendar", async () => {
    const { result } = setup();

    act(() => result.current.open(null));
    await act(() =>
      result.current.loadFile(new File(["BEGIN:VCALENDAR\r\nEND:VCALENDAR"], "Fall.ics")),
    );
    expect(result.current.source).toMatchObject({ state: "ready", origin: "file:Fall.ics" });
    expect(result.current.form.getValues("name")).toBe("Fall");

    await act(() => result.current.loadFile(new File(["hello"], "notes.txt")));
    expect(result.current.source).toMatchObject({ state: "error" });
  });

  it("saves a subscription, handing over what it already read of that same link", async () => {
    server.use(http.get(FEED, () => HttpResponse.text(ICS)));
    const { result, onSaved } = setup();

    act(() => result.current.open(null));
    await act(() => result.current.loadUrl(FEED));
    await act(() => result.current.submit({ ...result.current.form.getValues(), url: FEED }));

    const [feed] = await listFeeds();

    expect(onSaved).toHaveBeenCalledWith(feed, ICS);
    expect(result.current.isOpen).toBe(false);

    // A different link than the one previewed is fetched afresh rather than trusted.
    act(() => result.current.open(feed));
    await act(() => result.current.loadUrl(FEED));
    await act(() =>
      result.current.submit({ ...toFormValues(feed), url: "https://other.example.edu/b.ics" }),
    );
    expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ id: feed.id }), undefined);
  });

  it("asks a new file import for its file, and lets an existing one save without", async () => {
    const { result, onSaved } = setup();
    const values = { ...toFormValues(null), source: "file" as const, name: "File" };

    act(() => result.current.open(null));
    await act(() => result.current.submit(values));
    expect(result.current.source).toMatchObject({
      state: "error",
      message: "Choose the calendar file to import.",
    });
    expect(onSaved).not.toHaveBeenCalled();

    await act(() => result.current.loadFile(new File([ICS], "a.ics")));
    await act(() => result.current.submit(values));
    expect(onSaved.mock.lastCall?.[0].settings.url).toBe("");
    expect(onSaved.mock.lastCall?.[1]).toBe(ICS);

    const [feed] = await listFeeds();

    act(() => result.current.open(feed));
    await act(() => result.current.submit({ ...toFormValues(feed), name: "Renamed" }));
    expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ id: feed.id }), undefined);
  });

  it("does not import a previewed link's text as a file", async () => {
    server.use(http.get(FEED, () => HttpResponse.text(ICS)));
    const { result } = setup();

    act(() => result.current.open(null));
    await act(() => result.current.loadUrl(FEED));
    await act(() => result.current.submit({ ...toFormValues(null), source: "file", name: "F" }));

    expect(result.current.source).toMatchObject({ state: "error" });
  });
});
