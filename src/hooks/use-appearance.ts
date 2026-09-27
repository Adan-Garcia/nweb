import { useSyncExternalStore } from "react";

import { isDarkTheme, type ResolvedTheme, resolveTheme } from "@/lib/preferences-model";
import { usePreferencesStore } from "@/stores/use-preferences-store";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function darkQuery(): MediaQueryList | null {
  // jsdom and some embedded browsers have no `matchMedia`; they are simply never "dark".
  return typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
}

function subscribeToSystemTheme(onChange: () => void) {
  const query = darkQuery();

  query?.addEventListener?.("change", onChange);

  return () => query?.removeEventListener?.("change", onChange);
}

/** Whether the operating system is in dark mode, and a re-render when that changes. */
export function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(subscribeToSystemTheme, () => darkQuery()?.matches ?? false);
}

/**
 * The look as chosen and as resolved: "system" becomes light or dark here, so nothing
 * below has to ask the operating system itself.
 */
export function useAppearance() {
  const preferences = usePreferencesStore((state) => state.preferences);
  const update = usePreferencesStore((state) => state.update);
  const resolvedTheme: ResolvedTheme = resolveTheme(preferences.theme, useSystemPrefersDark());
  const isDark = isDarkTheme(resolvedTheme);

  /** The one-click switch: to the other of light and dark, leaving "system" behind. */
  const toggleTheme = () => update({ theme: isDark ? "light" : "dark" });

  return { preferences, update, resolvedTheme, isDark, toggleTheme };
}
