import { describe, expect, it } from "vitest";

import {
  defaultFeedSettings,
  type Feed,
  feedSettingsSchema,
  isFeedDue,
  normalizeFeedUrl,
} from "./feed-model";

function makeFeed(overrides: Partial<Feed> = {}, settings: Partial<Feed["settings"]> = {}): Feed {
  return {
    id: "feed-1",
    createdAt: 0,
    updatedAt: 0,
    lastFetchedAt: null,
    lastError: null,
    lastCount: null,
    settings: { ...defaultFeedSettings(), url: "https://example.edu/feed.ics", ...settings },
    ...overrides,
  };
}

describe("normalizeFeedUrl", () => {
  it("reads webcal as https and keeps http(s)", () => {
    expect(normalizeFeedUrl("  webcal://example.edu/feed.ics ")).toBe(
      "https://example.edu/feed.ics",
    );
    expect(normalizeFeedUrl("webcals://example.edu/a")).toBe("https://example.edu/a");
    expect(normalizeFeedUrl("http://example.edu/a")).toBe("http://example.edu/a");
  });

  it("refuses anything else", () => {
    expect(normalizeFeedUrl("ftp://example.edu/a")).toBeNull();
    expect(normalizeFeedUrl("not a url")).toBeNull();
  });
});

describe("isFeedDue", () => {
  it("is due when never fetched, or once its interval has passed", () => {
    expect(isFeedDue(makeFeed(), 0)).toBe(true);
    expect(isFeedDue(makeFeed({ lastFetchedAt: 0 }), 359 * 60_000)).toBe(false);
    expect(isFeedDue(makeFeed({ lastFetchedAt: 0 }), 360 * 60_000)).toBe(true);
  });

  it("is never due for a file import or a manual feed", () => {
    expect(isFeedDue(makeFeed({}, { url: "" }), 0)).toBe(false);
    expect(isFeedDue(makeFeed({}, { refreshMinutes: 0 }), 0)).toBe(false);
  });
});

describe("feedSettingsSchema", () => {
  it("accepts the defaults and fills in a rule's optional parts", () => {
    const parsed = feedSettingsSchema.parse({
      ...defaultFeedSettings(),
      rules: [{ id: "r", action: "exclude", field: "title", pattern: "x" }],
    });

    expect(parsed.rules[0]).toMatchObject({ caseSensitive: false, enabled: true, kind: "other" });
  });
});
