import { describe, expect, it } from "vitest";

import { defaultFeedSettings, type Feed } from "@/lib/feeds/feed-model";
import { makeSnapshot } from "@/test/workspace-fixtures";

import {
  feedBranchOptions,
  feedFormSchema,
  newRule,
  REFRESH_OPTIONS,
  toFeedSettings,
  toFormValues,
} from "./feed-form";

function makeFeed(settings: Partial<Feed["settings"]> = {}): Feed {
  return {
    id: "feed-1",
    createdAt: 0,
    updatedAt: 0,
    lastFetchedAt: null,
    lastError: null,
    lastCount: null,
    removedIds: [],
    dismissedIds: [],
    settings: { ...defaultFeedSettings(), name: "myCourses", ...settings },
  };
}

describe("the feed form", () => {
  it("starts a new feed as a subscription with the defaults", () => {
    expect(toFormValues(null)).toMatchObject({
      source: "url",
      branchId: "",
      refreshMinutes: "360",
      pastDays: "14",
      completePast: true,
      rules: [],
    });
  });

  it("round-trips a subscription through the form", () => {
    const feed = makeFeed({ url: "https://example.edu/a.ics", branchId: "b", pastDays: null });
    const values = toFormValues(feed);

    expect(values).toMatchObject({ source: "url", branchId: "b", pastDays: "" });
    expect(toFeedSettings(values)).toEqual(feed.settings);
  });

  it("reads an existing feed with no address as a file, which never refreshes itself", () => {
    const values = toFormValues(makeFeed({ url: "" }));

    expect(values.source).toBe("file");
    expect(toFeedSettings({ ...values, url: "https://ignored.example" })).toMatchObject({
      url: "",
      refreshMinutes: 0,
    });
  });

  it("normalises a webcal link on the way out", () => {
    const values = { ...toFormValues(null), name: " Courses ", url: "webcal://example.edu/a" };

    expect(toFeedSettings(values)).toMatchObject({ name: "Courses", url: "https://example.edu/a" });
    expect(toFeedSettings({ ...values, url: "nonsense" }).url).toBe("");
  });

  it("asks for a name, a link, a number of days, a working pattern and a course", () => {
    const result = feedFormSchema.safeParse({
      ...toFormValues(null),
      name: " ",
      url: "not a link",
      pastDays: "a week",
      rules: [
        { ...newRule(), pattern: "(" },
        { ...newRule(), action: "set-branch", pattern: "x", branchId: "" },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["name", "url", "pastDays", "rules.0.pattern", "rules.1.branchId"]),
    );
  });

  it("does not ask a file import for a link", () => {
    expect(
      feedFormSchema.safeParse({ ...toFormValues(null), source: "file", name: "F" }).success,
    ).toBe(true);
  });

  it("labels each refresh interval", () => {
    expect(REFRESH_OPTIONS.map((option) => option.label)).toEqual([
      "Only when I refresh it",
      "Every 1 hour",
      "Every 6 hours",
      "Every 12 hours",
      "Once a day",
    ]);
  });
});

describe("feedBranchOptions", () => {
  it("offers this workspace's courses with their term, and not a shared one's name alone", () => {
    const snapshot = makeSnapshot();
    const options = feedBranchOptions({
      ...snapshot,
      branches: [
        ...snapshot.branches,
        { ...snapshot.branches[0], id: "orphan", flightId: "gone", name: "Adrift" },
      ],
    });

    expect(options.map((option) => option.label)).toEqual(
      expect.arrayContaining([
        "Adrift",
        `${snapshot.flights[0].name} / ${snapshot.branches[0].name}`,
      ]),
    );
    expect(
      feedBranchOptions({ ...snapshot, readOnly: new Set([snapshot.branches[0].id]) }),
    ).not.toContainEqual(expect.objectContaining({ id: snapshot.branches[0].id }));
  });
});
