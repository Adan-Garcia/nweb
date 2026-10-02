import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREFERENCES,
  isDarkTheme,
  normalizeOrder,
  preferencesSchema,
  resolveTheme,
  stampPreferences,
} from "./preferences-model";

describe("preferencesSchema", () => {
  it("fills every field in from nothing", () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      id: "self",
      theme: "system",
      accent: "rose",
      density: "comfortable",
      fontSize: "md",
      sidebar: "expanded",
      navOrder: ["dashboard", "calendar", "board", "notes"],
      dashboardCards: [
        { id: "next-priority", visible: true },
        { id: "stats", visible: true },
        { id: "upcoming", visible: true },
        { id: "recent-notes", visible: true },
      ],
      reminderPrompt: "offer",
      penSmoothing: 0.5,
      penPresets: [],
      updatedAt: 0,
      deletedAt: null,
      keyId: undefined,
    });
  });

  it("falls back field by field, keeping what it does understand", () => {
    const parsed = preferencesSchema.parse({
      theme: "neon",
      accent: "indigo",
      density: 3,
      fontSize: "lg",
      updatedAt: -1,
    });

    expect(parsed).toMatchObject({
      theme: "system",
      accent: "indigo",
      density: "comfortable",
      fontSize: "lg",
      updatedAt: 0,
    });
  });

  it("drops unknown and repeated nav ids and appends the missing ones", () => {
    expect(
      preferencesSchema.parse({ navOrder: ["notes", "inbox", "notes", "board"] }).navOrder,
    ).toEqual(["notes", "board", "dashboard", "calendar"]);
    expect(preferencesSchema.parse({ navOrder: "notes" }).navOrder).toEqual(
      DEFAULT_PREFERENCES.navOrder,
    );
  });

  it("keeps dashboard card visibility, drops unknown cards and appends missing ones shown", () => {
    const { dashboardCards } = preferencesSchema.parse({
      dashboardCards: [
        { id: "recent-notes", visible: false },
        { id: "weather", visible: true },
        { id: "stats", visible: true },
      ],
    });

    expect(dashboardCards).toEqual([
      { id: "recent-notes", visible: false },
      { id: "stats", visible: true },
      { id: "next-priority", visible: true },
      { id: "upcoming", visible: true },
    ]);
  });

  it("replaces a malformed card list with the default one", () => {
    expect(preferencesSchema.parse({ dashboardCards: [{ id: 1 }] }).dashboardCards).toEqual(
      DEFAULT_PREFERENCES.dashboardCards,
    );
  });
});

describe("pen settings", () => {
  const preset = { id: "p1", tool: "pen", color: "#ab12cd", width: 3, sensitivity: 0.6 };

  it("keeps the presets that read and drops the rest, without losing the smoothing", () => {
    const parsed = preferencesSchema.parse({
      penSmoothing: 0.2,
      penPresets: [preset, { ...preset, id: "p2", color: "chartreuse" }, { id: "p3" }],
    });

    expect(parsed.penSmoothing).toBe(0.2);
    expect(parsed.penPresets).toEqual([preset]);
  });

  it("falls back on the default smoothing and no presets when they are not what it expects", () => {
    const parsed = preferencesSchema.parse({ penSmoothing: 3, penPresets: "many" });

    expect(parsed).toMatchObject({ penSmoothing: 0.5, penPresets: [] });
  });

  it("keeps no more than six presets", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ ...preset, id: `p${i}` }));

    expect(preferencesSchema.parse({ penPresets: many }).penPresets).toHaveLength(6);
  });
});

describe("normalizeOrder", () => {
  it("keeps the given order and appends what is missing", () => {
    expect(normalizeOrder(["b"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });

  it("drops what the full list does not have, and repeats", () => {
    expect(normalizeOrder(["z", "c", "c"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });
});

describe("stampPreferences", () => {
  it("applies the change and dates it now", () => {
    const next = stampPreferences(DEFAULT_PREFERENCES, { accent: "teal" }, 5_000);

    expect(next).toMatchObject({ accent: "teal", updatedAt: 5_000 });
  });

  it("is always newer than the edit it replaces, even inside one millisecond", () => {
    const first = stampPreferences(DEFAULT_PREFERENCES, { accent: "teal" }, 5_000);
    const second = stampPreferences(first, { accent: "blue" }, 5_000);

    expect(second.updatedAt).toBe(5_001);
  });
});

describe("resolveTheme", () => {
  it("asks the system only when the choice is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("paper", true)).toBe("paper");
    expect(resolveTheme("oled", false)).toBe("oled");
  });

  it("counts black as dark and paper as light", () => {
    expect(isDarkTheme("oled")).toBe(true);
    expect(isDarkTheme("dark")).toBe(true);
    expect(isDarkTheme("paper")).toBe(false);
    expect(isDarkTheme("light")).toBe(false);
  });
});
