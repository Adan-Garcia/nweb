import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNotesDb } from "@/lib/db/notes-db";
import { DEFAULT_PREFERENCES } from "@/lib/preferences/preferences-model";
import { readPreferences, writePreferences } from "@/lib/preferences/preferences-storage";
import type { SyncListener } from "@/lib/sync/sync-service";
import { usePreferencesStore } from "@/stores/use-preferences-store";

const sync = vi.hoisted(() => ({ listener: null as SyncListener | null, unsubscribe: vi.fn() }));

vi.mock("@/lib/sync/sync-service", () => ({
  subscribeToSyncChanges: (listener: SyncListener) => {
    sync.listener = listener;
    return sync.unsubscribe;
  },
}));

import { useApplyAppearance } from "./use-apply-appearance";

beforeEach(async () => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  const database = await getNotesDb();
  await database.clear("preferences");
});

describe("useApplyAppearance", () => {
  it("dresses <html> in the preferences and follows every change", () => {
    renderHook(() => useApplyAppearance());

    expect(document.documentElement.dataset.theme).toBe("light");
    act(() => usePreferencesStore.getState().update({ theme: "dark", accent: "blue" }));

    expect(document.documentElement.dataset).toMatchObject({ theme: "dark", accent: "blue" });
    expect(document.documentElement).toHaveClass("dark");
  });

  it("picks up a newer row from IndexedDB once it has been read", async () => {
    await writePreferences({ ...DEFAULT_PREFERENCES, accent: "teal", updatedAt: Date.now() });

    renderHook(() => useApplyAppearance());

    await waitFor(() => expect(document.documentElement.dataset.accent).toBe("teal"));
  });

  it("keeps the cached look when the database will not open", async () => {
    const hydrate = vi
      .spyOn(usePreferencesStore.getState(), "hydrate")
      .mockRejectedValue(new Error("blocked"));
    usePreferencesStore.setState({ hydrate });

    renderHook(() => useApplyAppearance());

    await waitFor(() => expect(hydrate).toHaveBeenCalled());
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("applies preferences another device synced, and nothing else", async () => {
    const { unmount } = renderHook(() => useApplyAppearance());
    // Let the first load seed its row, so it cannot land on top of the synced one.
    await waitFor(async () => expect(await readPreferences()).not.toBeNull());
    await writePreferences({ ...DEFAULT_PREFERENCES, density: "compact", updatedAt: Date.now() });

    act(() => sync.listener?.([{ store: "twigs", id: "t1" }]));
    expect(document.documentElement.dataset.density).toBe("comfortable");

    act(() => sync.listener?.([{ store: "preferences", id: "self" }]));
    await waitFor(() => expect(document.documentElement.dataset.density).toBe("compact"));

    unmount();
    expect(sync.unsubscribe).toHaveBeenCalled();
  });

  it("does nothing when a synced change left no row behind", async () => {
    const receive = vi.fn();
    // Nothing is seeded either, so the read the listener makes finds no row.
    usePreferencesStore.setState({ receive, hydrate: () => Promise.resolve() });
    renderHook(() => useApplyAppearance());

    act(() => sync.listener?.([{ store: "preferences", id: "self" }]));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(receive).not.toHaveBeenCalled();
  });
});
