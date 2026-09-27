import { screen, waitFor } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { expect } from "vitest";

import { readCachedPreferences } from "@/lib/preferences-cache";

/**
 * A menu button once its menu has loaded. The menus are loaded on demand, and until then a
 * disabled button of the same name stands in for them, so a test waits for the real one.
 * Some screens render two — one placed for a phone, one for a wide screen — so the first
 * one is used.
 */
export async function findLoadedButton(name: string): Promise<HTMLElement> {
  await waitFor(() => expect(screen.getAllByRole("button", { name })[0]).toBeEnabled());

  return screen.getAllByRole("button", { name })[0];
}

/** Picks a theme from a screen's theme menu. */
export async function chooseTheme(user: UserEvent, label: string): Promise<void> {
  await user.click(await findLoadedButton("Theme"));
  await user.click(await screen.findByRole("menuitemradio", { name: label }));
}

/** The theme as the next first paint would read it. */
export function cachedTheme(): string {
  return readCachedPreferences().theme;
}
