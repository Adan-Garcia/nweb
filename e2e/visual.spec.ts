import { expect, test } from "./fixtures";

/**
 * Local visual regression, the repeatable version of "screenshot before, change, screenshot after".
 * Baselines are not committed (font rendering differs between machines), so:
 *
 *   npm run test:visual -- --update-snapshots   # before a UI change: record baselines
 *   npm run test:visual                         # after: fails on any pixel difference
 *
 * Baselines live in e2e/__visual__ (git-ignored).
 */
const PAGES = [
  ["landing", "/"],
  ["auth", "/auth"],
  ["signin", "/auth/signin"],
  ["signup", "/auth/signup"],
  ["pricing", "/pricing"],
  ["notes", "/notes"],
] as const;

const SIZES = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 480, height: 900 },
} as const;

test.use({ reducedMotion: "reduce" });

for (const scheme of ["light", "dark"] as const) {
  for (const [sizeName, viewport] of Object.entries(SIZES)) {
    for (const [name, path] of PAGES) {
      test(`${name} · ${sizeName} · ${scheme}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: scheme });
        await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);

        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        if (name === "notes") {
          await expect(page.getByText(/Autosave enabled|Autosaved at/)).toBeVisible();
        }

        await expect(page).toHaveScreenshot(`${name}-${sizeName}-${scheme}.png`, {
          animations: "disabled",
          // The autosave label contains a wall-clock time.
          mask: [page.getByText(/^Autosaved at/)],
        });
      });
    }
  }
}
