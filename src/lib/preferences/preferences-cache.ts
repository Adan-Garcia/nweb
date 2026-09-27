import {
  DEFAULT_PREFERENCES,
  isDarkTheme,
  type Preferences,
  preferencesSchema,
  resolveTheme,
} from "./preferences-model";

/**
 * The `localStorage` copy of the preferences, which is what the first paint reads.
 *
 * IndexedDB is the record and the one that syncs; this is a cache of it, kept because an
 * async read would paint the default look and then repaint in the chosen one. The boot
 * script in `index.html` reads the same key, before any of this bundle has loaded.
 *
 * `LEGACY_THEME_KEY` is what the old light/dark toggle wrote. It is read once, when there is
 * no cache yet, so someone who picked dark before this existed is not flashed with light.
 */
export const PREFERENCES_CACHE_KEY = "cuervo-preferences";
export const LEGACY_THEME_KEY = "theme";

function readLegacyTheme(): Partial<Preferences> {
  const legacy = window.localStorage.getItem(LEGACY_THEME_KEY);

  return legacy === "dark" || legacy === "light" ? { theme: legacy } : {};
}

export function readCachedPreferences(): Preferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(PREFERENCES_CACHE_KEY);

    return preferencesSchema.parse(raw ? (JSON.parse(raw) as unknown) : readLegacyTheme());
  } catch {
    // Unparseable JSON or blocked storage costs the look, not the page.
    return DEFAULT_PREFERENCES;
  }
}

export function writeCachedPreferences(preferences: Preferences): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(PREFERENCES_CACHE_KEY, JSON.stringify(preferences));
  } catch {
    // Still applies to this session; it just will not be there before the next first paint.
  }
}

/**
 * Puts the preferences on `<html>` as attributes the stylesheet keys off. The class `dark`
 * stays alongside `data-theme`, because every `dark:` utility is written against it.
 */
export function applyPreferencesToDocument(
  preferences: Preferences,
  systemPrefersDark: boolean,
  root: HTMLElement = document.documentElement,
): void {
  const theme = resolveTheme(preferences.theme, systemPrefersDark);

  root.dataset.theme = theme;
  root.dataset.accent = preferences.accent;
  root.dataset.density = preferences.density;
  root.dataset.fontSize = preferences.fontSize;
  root.classList.toggle("dark", isDarkTheme(theme));
  root.style.colorScheme = isDarkTheme(theme) ? "dark" : "light";
}
