import { z } from "zod";

import { DEFAULT_SMOOTHING, readPenPresets, smoothingSchema } from "../canvas/pen-settings";

/**
 * How someone has arranged the app for themselves: its look, and the order of the things
 * they reach for. One row per workspace, synced like the rest of it, so a laptop and a
 * phone signed in to one account look the same.
 *
 * Every field falls back on its own. A row written by a later build with an accent this one
 * does not know keeps its density and its nav order rather than resetting the lot, and a
 * list that has lost or gained an entry is normalised rather than refused.
 */
export const PREFERENCES_ID = "self";

export const THEME_MODES = ["system", "light", "dark", "paper", "oled"] as const;
export const ACCENTS = [
  "rose",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "violet",
] as const;
export const DENSITIES = ["compact", "comfortable", "spacious"] as const;
export const FONT_SIZES = ["sm", "md", "lg"] as const;
export const SIDEBAR_MODES = ["expanded", "icons"] as const;
export const NAV_IDS = ["dashboard", "calendar", "board", "notes"] as const;
export const DASHBOARD_CARD_IDS = ["next-priority", "stats", "upcoming", "recent-notes"] as const;
/** Whether the offer to turn on reminders has been waved away with "Not now". */
export const REMINDER_PROMPTS = ["offer", "dismissed"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];
export type Accent = (typeof ACCENTS)[number];
export type Density = (typeof DENSITIES)[number];
export type FontSize = (typeof FONT_SIZES)[number];
export type SidebarMode = (typeof SIDEBAR_MODES)[number];
export type NavId = (typeof NAV_IDS)[number];
export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number];
export type ReminderPrompt = (typeof REMINDER_PROMPTS)[number];
export type DashboardCardPref = { id: DashboardCardId; visible: boolean };

/** Keeps the order given, drops what is unknown or repeated, and appends what is missing. */
export function normalizeOrder<Id extends string>(order: readonly Id[], all: readonly Id[]): Id[] {
  const kept = new Set<Id>();

  for (const id of order) {
    if (all.includes(id)) {
      kept.add(id);
    }
  }

  return [...kept, ...all.filter((id) => !kept.has(id))];
}

function normalizeCards(cards: DashboardCardPref[]): DashboardCardPref[] {
  const byId = new Map(cards.map((card) => [card.id, card.visible]));

  return normalizeOrder(
    cards.map((card) => card.id),
    DASHBOARD_CARD_IDS,
  ).map((id) => ({ id, visible: byId.get(id) ?? true }));
}

const DEFAULT_NAV = [...NAV_IDS];
const DEFAULT_CARDS = DASHBOARD_CARD_IDS.map((id) => ({ id, visible: true }));

export const preferencesSchema = z.object({
  id: z.literal(PREFERENCES_ID).catch(PREFERENCES_ID),
  theme: z.enum(THEME_MODES).catch("system"),
  accent: z.enum(ACCENTS).catch("rose"),
  density: z.enum(DENSITIES).catch("comfortable"),
  fontSize: z.enum(FONT_SIZES).catch("md"),
  sidebar: z.enum(SIDEBAR_MODES).catch("expanded"),
  navOrder: z
    .array(z.string())
    .catch(DEFAULT_NAV)
    .transform((order) =>
      normalizeOrder(
        order.filter((id): id is NavId => NAV_IDS.some((known) => known === id)),
        NAV_IDS,
      ),
    ),
  dashboardCards: z
    .array(z.object({ id: z.string(), visible: z.boolean() }))
    .catch(DEFAULT_CARDS)
    .transform((cards) =>
      normalizeCards(
        cards.filter((card): card is DashboardCardPref =>
          DASHBOARD_CARD_IDS.some((known) => known === card.id),
        ),
      ),
    ),
  reminderPrompt: z.enum(REMINDER_PROMPTS).catch("offer"),
  /** How much ink is smoothed, everywhere it is drawn (`docs/canvas.md`, "Settings"). */
  penSmoothing: smoothingSchema.catch(DEFAULT_SMOOTHING),
  /** Saved pens and highlighters, oldest first. */
  penPresets: z.unknown().transform(readPenPresets),
  updatedAt: z.number().int().nonnegative().catch(0),
  deletedAt: z.number().nullable().catch(null),
  /** Always empty: the row is never sealed at rest. Declared as any synced row may carry it. */
  keyId: z.string().optional().catch(undefined),
});

export type Preferences = z.output<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({});

/** The fields someone can change. The rest say which row this is and when it was written. */
export type PreferencesPatch = Partial<
  Omit<Preferences, "id" | "updatedAt" | "deletedAt" | "keyId">
>;

/**
 * A change, as a new edit: strictly newer than the one it replaces, so two changes inside
 * one millisecond are still two edits as far as sync is concerned.
 */
export function stampPreferences(
  current: Preferences,
  patch: PreferencesPatch,
  now: number = Date.now(),
): Preferences {
  return preferencesSchema.parse({
    ...current,
    ...patch,
    updatedAt: Math.max(now, current.updatedAt + 1),
  });
}

/** What the look resolves to once "system" has been asked. */
export type ResolvedTheme = Exclude<ThemeMode, "system">;

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode !== "system") {
    return mode;
  }

  return systemPrefersDark ? "dark" : "light";
}

export function isDarkTheme(theme: ResolvedTheme): boolean {
  return theme === "dark" || theme === "oled";
}
