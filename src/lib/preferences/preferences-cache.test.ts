import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyPreferencesToDocument,
  LEGACY_THEME_KEY,
  PREFERENCES_CACHE_KEY,
  readCachedPreferences,
  writeCachedPreferences,
} from "./preferences-cache";
import { DEFAULT_PREFERENCES } from "./preferences-model";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("readCachedPreferences", () => {
  it("is the defaults when nothing has been cached", () => {
    expect(readCachedPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("reads back what was written", () => {
    writeCachedPreferences({ ...DEFAULT_PREFERENCES, accent: "violet", density: "compact" });

    expect(readCachedPreferences()).toMatchObject({ accent: "violet", density: "compact" });
  });

  it("carries over the old light/dark toggle's choice when there is no cache yet", () => {
    window.localStorage.setItem(LEGACY_THEME_KEY, "dark");

    expect(readCachedPreferences().theme).toBe("dark");
  });

  it("ignores an old toggle value it does not recognise", () => {
    window.localStorage.setItem(LEGACY_THEME_KEY, "sepia");

    expect(readCachedPreferences().theme).toBe("system");
  });

  it("prefers the cache over the old toggle", () => {
    window.localStorage.setItem(LEGACY_THEME_KEY, "dark");
    writeCachedPreferences({ ...DEFAULT_PREFERENCES, theme: "paper" });

    expect(readCachedPreferences().theme).toBe("paper");
  });

  it("falls back to the defaults on unreadable JSON", () => {
    window.localStorage.setItem(PREFERENCES_CACHE_KEY, "{ not json");

    expect(readCachedPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("falls back to the defaults when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readCachedPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("is the defaults where there is no window", () => {
    vi.stubGlobal("window", undefined);

    expect(readCachedPreferences()).toEqual(DEFAULT_PREFERENCES);
  });
});

describe("writeCachedPreferences", () => {
  it("does not throw when storage is full or blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(() => writeCachedPreferences(DEFAULT_PREFERENCES)).not.toThrow();
  });

  it("does nothing where there is no window", () => {
    vi.stubGlobal("window", undefined);

    expect(() => writeCachedPreferences(DEFAULT_PREFERENCES)).not.toThrow();
  });
});

describe("applyPreferencesToDocument", () => {
  it("puts every preference on <html> and resolves system against the OS", () => {
    const root = document.createElement("html");

    applyPreferencesToDocument(
      { ...DEFAULT_PREFERENCES, accent: "teal", density: "spacious", fontSize: "lg" },
      true,
      root,
    );

    expect(root.dataset).toMatchObject({
      theme: "dark",
      accent: "teal",
      density: "spacious",
      fontSize: "lg",
    });
    expect(root).toHaveClass("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("keeps a light theme light whatever the OS says, and clears the dark class", () => {
    const root = document.createElement("html");
    root.classList.add("dark");

    applyPreferencesToDocument({ ...DEFAULT_PREFERENCES, theme: "paper" }, true, root);

    expect(root.dataset.theme).toBe("paper");
    expect(root).not.toHaveClass("dark");
    expect(root.style.colorScheme).toBe("light");
  });

  it("dresses the real document by default", () => {
    applyPreferencesToDocument({ ...DEFAULT_PREFERENCES, theme: "oled" }, false);

    expect(document.documentElement.dataset.theme).toBe("oled");
    expect(document.documentElement).toHaveClass("dark");
  });
});
