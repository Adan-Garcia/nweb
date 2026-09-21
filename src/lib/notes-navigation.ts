/**
 * How the notes page is navigated, remembered between visits.
 *
 * Two ways of getting to a note, because they suit different habits: the path bar picks a
 * wing, flight, branch and nest one dropdown at a time, and the tree shows every saved
 * note at once under the same five levels. Neither is a mode the data cares about — both
 * read the same rows — so this is a preference and not state.
 *
 * It lives in `localStorage` rather than IndexedDB for the same reason the theme does:
 * the first paint has to know, and an async read would show one layout and then the other.
 */
export const NOTES_NAVIGATION_MODES = ["path", "tree"] as const;

export type NotesNavigationMode = (typeof NOTES_NAVIGATION_MODES)[number];

export const DEFAULT_NOTES_NAVIGATION: NotesNavigationMode = "path";

const STORAGE_KEY = "cuervo-notes-navigation";

function isNavigationMode(value: string | null): value is NotesNavigationMode {
  return NOTES_NAVIGATION_MODES.some((mode) => mode === value);
}

export function readNotesNavigationMode(): NotesNavigationMode {
  if (typeof window === "undefined") {
    return DEFAULT_NOTES_NAVIGATION;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    return isNavigationMode(stored) ? stored : DEFAULT_NOTES_NAVIGATION;
  } catch {
    // Blocked storage costs a preference, not the page.
    return DEFAULT_NOTES_NAVIGATION;
  }
}

export function writeNotesNavigationMode(mode: NotesNavigationMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // The choice still applies to this session; it just will not outlive it.
  }
}
