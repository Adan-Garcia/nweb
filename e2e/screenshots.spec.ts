import type { Page } from "@playwright/test";

import { signUp, visit } from "./account";
import { expect, test } from "./fixtures";
import { createNote } from "./helpers";

/**
 * Screenshots of every page and menu, for looking at the app rather than testing it.
 *
 *   npm run screenshots                                  # everything, light and dark
 *   SHOTS=notes,palette npm run screenshots              # only these targets
 *   SHOT_SCHEME=dark SHOT_SIZE=mobile npm run screenshots
 *
 * Files land in screenshots/ (git-ignored) as <target>-<size>-<scheme>.png. Nothing is compared:
 * that is `npm run test:visual`.
 */
type Target = {
  path: string;
  /** Workspace pages need the local account unlocked; public pages are shot signed out. */
  workspace: boolean;
  /** Opens the menu to shoot, once the page is ready. Pages leave it out. */
  open?: (page: Page) => Promise<void>;
};

const TARGETS: Record<string, Target> = {
  landing: { path: "/", workspace: false },
  auth: { path: "/auth", workspace: false },
  signin: { path: "/auth/signin", workspace: false },
  signup: { path: "/auth/signup", workspace: false },
  pricing: { path: "/pricing", workspace: false },
  documentation: { path: "/documentation", workspace: false },
  privacy: { path: "/privacy", workspace: false },
  dashboard: { path: "/dashboard", workspace: true },
  calendar: { path: "/calendar", workspace: true },
  board: { path: "/board", workspace: true },
  notes: { path: "/notes", workspace: true },
  settings: { path: "/settings", workspace: true },

  "notes-canvas": {
    path: "/notes",
    workspace: true,
    open: async (page) => {
      await createNote(page, "Canvas", "spatial");
    },
  },

  "theme-menu": {
    path: "/",
    workspace: false,
    open: async (page) => {
      await page.getByRole("button", { name: "Theme" }).first().click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
  },
  palette: {
    path: "/dashboard",
    workspace: true,
    open: async (page) => {
      await page.keyboard.press("Control+k");
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  notifications: {
    path: "/dashboard",
    workspace: true,
    open: async (page) => {
      await page
        .getByRole("button", { name: /^Notifications/ })
        .first()
        .click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
  },
  "notes-location": {
    path: "/notes",
    workspace: true,
    open: async (page) => {
      await page.getByRole("button", { name: "Untitled note" }).click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
  },
};

const SIZES = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 480, height: 900 },
} as const;

function pick<T extends string>(env: string | undefined, all: readonly T[]): T[] {
  const wanted = env?.split(",").map((value) => value.trim()) ?? [];
  const chosen = all.filter((value) => wanted.includes(value));

  return chosen.length ? chosen : [...all];
}

const targets = pick(process.env.SHOTS, Object.keys(TARGETS));
const sizes = pick(process.env.SHOT_SIZE, ["desktop", "mobile"] as const);
const schemes = pick(process.env.SHOT_SCHEME, ["light", "dark"] as const);

// Sign-up happens per target below, only for workspace pages.
test.use({ reducedMotion: "reduce", signedUp: false });

for (const name of targets) {
  const target = TARGETS[name];

  for (const size of sizes) {
    for (const scheme of schemes) {
      test(`${name} · ${size} · ${scheme}`, async ({ page }) => {
        await page.setViewportSize(SIZES[size]);
        await page.emulateMedia({ colorScheme: scheme });
        await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);

        if (target.workspace) {
          await signUp(page);
          await visit(page, target.path);
          await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
        } else {
          await page.goto(target.path);
        }
        await page.evaluate(() => document.fonts.ready);
        await page.waitForLoadState("networkidle");
        await target.open?.(page);

        await page.screenshot({
          path: `screenshots/${name}-${size}-${scheme}.png`,
          // Anything opened is shot as it sits in the viewport; a plain page is shot whole.
          fullPage: !target.open,
          animations: "disabled",
        });
      });
    }
  }
}
