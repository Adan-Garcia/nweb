import { create } from "zustand";

import { readCachedPreferences, writeCachedPreferences } from "@/lib/preferences/preferences-cache";
import {
  type Preferences,
  type PreferencesPatch,
  stampPreferences,
} from "@/lib/preferences/preferences-model";

/**
 * The preferences, shared by every tree that shows or changes them: the sidebar, the
 * settings page, the command palette and each page's theme control are unrelated trees,
 * which is what this store is for (CLAUDE.md §2.4).
 *
 * Read from the `localStorage` cache synchronously, so the first render already has the
 * chosen look; then `hydrate` reconciles with IndexedDB, which is the copy that syncs.
 */
type PreferencesState = {
  preferences: Preferences;
  update: (patch: PreferencesPatch) => void;
  /** Takes whichever of the cache and IndexedDB is newer, and seeds IndexedDB if empty. */
  hydrate: () => Promise<void>;
  /** A row that arrived by sync, already written to IndexedDB. */
  receive: (preferences: Preferences) => void;
};

/**
 * IndexedDB, loaded on first use. The store is in the entry chunk because the first paint
 * reads it; the database layer behind it is not, and has no reason to be.
 */
const storage = () => import("@/lib/preferences/preferences-storage");

function persistRecord(preferences: Preferences) {
  // The cache already holds the change, so a failed write costs the sync of it, not the look.
  storage()
    .then(({ writePreferences }) => writePreferences(preferences))
    .catch(() => undefined);
}

export const usePreferencesStore = create<PreferencesState>()((set, get) => ({
  preferences: readCachedPreferences(),

  update: (patch) => {
    const next = stampPreferences(get().preferences, patch);

    set({ preferences: next });
    writeCachedPreferences(next);
    persistRecord(next);
  },

  hydrate: async () => {
    const stored = await (await storage()).readPreferences();
    const current = get().preferences;

    if (!stored || stored.updatedAt < current.updatedAt) {
      persistRecord(current);
      return;
    }

    get().receive(stored);
  },

  receive: (preferences) => {
    set({ preferences });
    writeCachedPreferences(preferences);
  },
}));
