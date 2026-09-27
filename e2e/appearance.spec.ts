import { ACCENT_PALETTE, THEME_BRAND } from "../src/lib/accent-palettes";
import { expect, test } from "./fixtures";

/**
 * The look, where only a real browser can tell: whether the stylesheet agrees with the
 * numbers the contrast test checked, whether the first paint is already in the chosen theme,
 * and whether the phone layout and the command palette work on a laid-out page.
 */

test("the stylesheet builds every accent and theme from the checked numbers", async ({ page }) => {
  await page.goto("/");

  const read = (accent: string, theme: string) =>
    page.evaluate(
      ([accentName, themeName]) => {
        const root = document.documentElement;
        root.dataset.accent = accentName;
        root.dataset.theme = themeName;
        const style = getComputedStyle(root);

        return {
          h: Number(style.getPropertyValue("--brand-h")),
          c: Number(style.getPropertyValue("--brand-c")),
          l: Number(style.getPropertyValue("--brand-l")),
        };
      },
      [accent, theme],
    );

  for (const [accent, { h, c }] of Object.entries(ACCENT_PALETTE)) {
    for (const [theme, { brandL }] of Object.entries(THEME_BRAND)) {
      expect(await read(accent, theme), `${theme} × ${accent}`).toEqual({ h, c, l: brandL });
    }
  }
});

test("a chosen look is painted before any script has run", async ({ page }) => {
  await page.goto("/settings#appearance");
  await page.getByRole("button", { name: "Black" }).click();
  await page.getByRole("button", { name: "Teal" }).click();
  await page.getByRole("button", { name: "Compact" }).click();

  // With the bundle refused, only the inline boot script in index.html can set these.
  await page.route("**/assets/*.js", (route) => route.abort());
  // Each refused script logs a load error, which is this test's point rather than a bug.
  page.removeAllListeners("console");
  await page.reload();

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "oled");
  await expect(root).toHaveAttribute("data-accent", "teal");
  await expect(root).toHaveAttribute("data-density", "compact");
  await expect(root).toHaveClass(/dark/);
});

test("the command palette goes anywhere from the keyboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Search or type a command…").fill("board");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/board$/);
  await expect(page.getByRole("heading", { level: 1, name: "Board" })).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("the tab bar moves between pages and More opens the rest", async ({ page }) => {
    await page.goto("/dashboard");
    const tabs = page.getByRole("navigation", { name: "Workspace" });

    await tabs.getByRole("link", { name: "Calendar" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await tabs.getByRole("button", { name: "More" }).click();
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

    // Nothing is wider than the screen.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
