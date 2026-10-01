import { expect, test } from "./fixtures";
import { createNote, openNotes } from "./helpers";

/** Whether the element in fullscreen is the canvas's shell: it holds the drawing toolbar. */
const canvasIsFullscreen = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.fullscreenElement?.querySelector('[role="toolbar"]') != null);

test("the canvas shell enters and leaves fullscreen from the toolbar", async ({ page }) => {
  await openNotes(page);
  await createNote(page, "Fullscreen E2E", "spatial");

  await page.getByRole("button", { name: "Enter canvas fullscreen" }).click();

  await expect.poll(() => canvasIsFullscreen(page)).toBe(true);
  await expect(page.getByRole("button", { name: "Exit canvas fullscreen" })).toBeVisible();

  await page.getByRole("button", { name: "Exit canvas fullscreen" }).click();

  await expect.poll(() => canvasIsFullscreen(page)).toBe(false);
  await expect(page.getByRole("button", { name: "Enter canvas fullscreen" })).toBeVisible();
});
