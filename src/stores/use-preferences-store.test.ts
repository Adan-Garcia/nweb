import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNotesDb } from "@/lib/notes-db";
import { readCachedPreferences, writeCachedPreferences } from "@/lib/preferences-cache";
import { DEFAULT_PREFERENCES } from "@/lib/preferences-model";
import { readPreferences, writePreferences } from "@/lib/preferences-storage";

import { usePreferencesStore } from "./use-preferences-store";

beforeEach(async () => {
  const database = await getNotesDb();
  await database.clear("preferences");
});

const state = () => usePreferencesStore.getState();

describe("usePreferencesStore", () => {
  it("applies a change at once, caches it, and records it for sync", async () => {
    state().update({ accent: "indigo" });

    expect(state().preferences.accent).toBe("indigo");
    expect(readCachedPreferences().accent).toBe("indigo");
    await expect.poll(async () => (await readPreferences())?.accent).toBe("indigo");
  });

  it("seeds IndexedDB from the cache the first time", async () => {
    usePreferencesStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, theme: "dark", updatedAt: 0 },
    });

    await state().hydrate();

    await expect.poll(async () => (await readPreferences())?.theme).toBe("dark");
  });

  it("takes the stored row when it is newer than the cache, and caches it", async () => {
    await writePreferences({ ...DEFAULT_PREFERENCES, accent: "green", updatedAt: 50 });
    usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES, updatedAt: 10 } });

    await state().hydrate();

    expect(state().preferences.accent).toBe("green");
    expect(readCachedPreferences().accent).toBe("green");
  });

  it("keeps the cache when it is newer than the stored row, and writes it back", async () => {
    await writePreferences({ ...DEFAULT_PREFERENCES, accent: "green", updatedAt: 10 });
    usePreferencesStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, accent: "violet", updatedAt: 50 },
    });

    await state().hydrate();

    expect(state().preferences.accent).toBe("violet");
    await expect.poll(async () => (await readPreferences())?.accent).toBe("violet");
  });

  it("takes a row that arrived by sync and caches it", () => {
    writeCachedPreferences(DEFAULT_PREFERENCES);

    state().receive({ ...DEFAULT_PREFERENCES, density: "compact", updatedAt: 99 });

    expect(state().preferences.density).toBe("compact");
    expect(readCachedPreferences().density).toBe("compact");
  });

  it("keeps the change on screen and in the cache when IndexedDB refuses it", async () => {
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    state().update({ accent: "amber" });
    await vi.waitFor(() => expect(put).toHaveBeenCalled());

    expect(state().preferences.accent).toBe("amber");
    expect(readCachedPreferences().accent).toBe("amber");
  });
});
