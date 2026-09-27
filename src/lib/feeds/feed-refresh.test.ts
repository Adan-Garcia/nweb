import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { server } from "@/test/server";

import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "../crypto/cipher";
import { getNotesDb } from "../db/notes-db";
import { listBranches } from "../hierarchy/entity-storage";
import { createObjectKey } from "../keys/key-graph";
import { createTwig, listTwigs } from "../twigs/twig-storage";
import { defaultFeedSettings, type FeedSettings } from "./feed-model";
import { feedCutoff, previewFeed, refreshDueFeeds, refreshFeed } from "./feed-refresh";
import { getFeed, saveFeed } from "./feed-storage";

const FEED = "https://calendar.example.edu/feed.ics";
const NOW = new Date(2026, 8, 27, 12);

const event = (uid: string, summary: string, start: string, location = "") => [
  "BEGIN:VEVENT",
  `UID:${uid}`,
  `SUMMARY:${summary}`,
  `LOCATION:${location}`,
  `DTSTART:${start}`,
  "END:VEVENT",
];

const ics = (...events: string[][]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flat(), "END:VCALENDAR"].join("\r\n");

const CALENDAR = ics(
  event("quiz", "Quiz 1 - Due", "20261001T035900Z", "MATH.182.10 - Calculus II"),
  event("hours", "Office Hours", "20261002T150000Z"),
  event("old", "Homework 0 - Due", "20250101T150000Z"),
  [
    "BEGIN:VEVENT",
    "UID:lecture",
    "SUMMARY:Lecture",
    "DTSTART;TZID=America/New_York:20260928T080000",
    "RRULE:FREQ=WEEKLY;COUNT=3",
    "END:VEVENT",
  ],
);

function settings(overrides: Partial<FeedSettings> = {}): FeedSettings {
  return {
    ...defaultFeedSettings(),
    name: "Courses",
    url: FEED,
    rules: [
      {
        id: "1",
        action: "exclude",
        field: "title",
        pattern: "office hours",
        caseSensitive: false,
        replacement: "",
        kind: "other",
        branchId: "",
        enabled: true,
      },
      {
        id: "2",
        action: "rename",
        field: "title",
        pattern: " - Due$",
        caseSensitive: false,
        replacement: "",
        kind: "other",
        branchId: "",
        enabled: true,
      },
      {
        id: "3",
        action: "branch-from",
        field: "location",
        pattern: "^(\\w+)\\.(\\d+)\\.\\d+ - (.+)$",
        caseSensitive: false,
        replacement: "$1 $2 $3",
        kind: "other",
        branchId: "",
        enabled: true,
      },
    ],
    ...overrides,
  };
}

beforeEach(async () => {
  const database = await getNotesDb();

  await Promise.all(
    (["feeds", "twigs", "wings", "flights", "branches"] as const).map((store) =>
      database.clear(store),
    ),
  );
});

afterEach(() => {
  resetActiveCipher();
});

describe("previewFeed", () => {
  it("expands, filters and renames without writing anything", () => {
    const { items, excluded } = previewFeed(CALENDAR, settings(), NOW);

    expect(excluded).toBe(1);
    expect(items.map((item) => item.title)).toEqual([
      "Quiz 1",
      "Homework 0",
      "Lecture",
      "Lecture",
      "Lecture",
    ]);
  });
});

describe("feedCutoff", () => {
  it("is so many days before today, or none", () => {
    expect(feedCutoff({ pastDays: 14 }, NOW)).toBe("2026-09-13");
    expect(feedCutoff({ pastDays: null }, NOW)).toBeNull();
  });
});

describe("refreshFeed", () => {
  it("fetches a feed, writes its events as tasks, and records the run", async () => {
    server.use(http.get(FEED, () => HttpResponse.text(CALENDAR)));
    const feed = await saveFeed(settings());

    const outcome = await refreshFeed(feed, undefined, NOW);

    expect(outcome).toMatchObject({
      ok: true,
      report: { added: 4, updated: 0, removed: 0, total: 5, excluded: 1 },
    });
    expect((await listTwigs()).map((twig) => [twig.title, twig.dueDate, twig.dueTime])).toEqual(
      expect.arrayContaining([
        ["Quiz 1", "2026-09-30", "11:59 PM"],
        ["Lecture", "2026-10-05", "8:00 AM"],
      ]),
    );
    // The old homework is long past, so it was never brought in, and nor was its course.
    expect((await listBranches()).map((branch) => branch.name).sort()).toEqual([
      "General",
      "MATH 182 Calculus II",
    ]);
    expect(await getFeed(feed.id)).toMatchObject({
      lastFetchedAt: NOW.getTime(),
      lastError: null,
      lastCount: 5,
    });
  });

  it("remembers what it removed across refreshes, and restores it when a rule is undone", async () => {
    const withLectures = await saveFeed(settings({ pastDays: null }));
    await refreshFeed(withLectures, CALENDAR, NOW);

    const hidden = settings({
      pastDays: null,
      rules: [
        {
          id: "x",
          action: "exclude",
          field: "title",
          pattern: "Lecture",
          caseSensitive: false,
          replacement: "",
          kind: "other",
          branchId: "",
          enabled: true,
        },
      ],
    });
    const edited = await saveFeed(hidden, withLectures.id);

    expect(await refreshFeed(edited, CALENDAR, NOW)).toMatchObject({
      ok: true,
      report: { removed: 3 },
    });
    expect((await getFeed(edited.id))?.removedIds).toHaveLength(3);

    const undone = await saveFeed(settings({ pastDays: null }), edited.id);

    expect(await refreshFeed((await getFeed(undone.id))!, CALENDAR, NOW)).toMatchObject({
      ok: true,
      report: { added: 3 },
    });
    expect((await listTwigs()).filter((twig) => twig.title === "Lecture")).toHaveLength(3);
  });

  it("imports a file's text without fetching anything", async () => {
    const feed = await saveFeed(settings({ url: "", pastDays: null }));

    expect(await refreshFeed(feed, CALENDAR, NOW)).toMatchObject({
      ok: true,
      report: { added: 5 },
    });
  });

  it("records a failure and removes nothing on the strength of it", async () => {
    server.use(http.get(FEED, () => HttpResponse.text(CALENDAR)));
    const feed = await saveFeed(settings());
    await refreshFeed(feed, undefined, NOW);

    server.use(http.get(FEED, () => new HttpResponse(null, { status: 500 })));
    const failed = await refreshFeed((await getFeed(feed.id))!, undefined, NOW);

    expect(failed).toEqual({ ok: false, error: "unreachable" });
    expect(await listTwigs()).toHaveLength(4);
    expect(await getFeed(feed.id)).toMatchObject({ lastError: "unreachable", lastCount: 5 });
  });

  it("reports text that will not parse as not a calendar", async () => {
    const feed = await saveFeed(settings());

    expect(await refreshFeed(feed, "nonsense", NOW)).toEqual({ ok: false, error: "not-calendar" });
  });

  it("reports a locked workspace as locked", async () => {
    const key = await createObjectKey("wing");

    setActiveCipher(createAesGcmCipher(key.key, key.keyId));
    await createTwig({ branchId: "b", title: "Sealed" });
    const feed = await saveFeed(settings({ url: "" }));
    resetActiveCipher();

    expect(await refreshFeed({ ...feed }, CALENDAR, NOW)).toEqual({ ok: false, error: "locked" });
  });
});

describe("refreshDueFeeds", () => {
  it("refreshes only the feeds that are due, and joins a sweep already running", async () => {
    let fetches = 0;
    server.use(
      http.get(FEED, () => {
        fetches += 1;

        return HttpResponse.text(CALENDAR);
      }),
    );
    await saveFeed(settings());
    await saveFeed(settings({ refreshMinutes: 0 }));
    await saveFeed(settings({ url: "" }));

    const first = refreshDueFeeds(NOW);

    expect(refreshDueFeeds(NOW)).toBe(first);
    expect(await first).toBe(1);
    expect(fetches).toBe(1);
    // Just refreshed, so not due again yet.
    expect(await refreshDueFeeds(NOW)).toBe(0);
  });
});
