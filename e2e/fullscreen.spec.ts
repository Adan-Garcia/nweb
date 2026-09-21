import { expect, test } from "./fixtures";
import { createNote, openNotes } from "./helpers";

const fullscreenClass = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.fullscreenElement?.className ?? null);

test("the canvas shell enters and leaves fullscreen from the toolbar", async ({ page }) => {
  await openNotes(page);
  await createNote(page, "Fullscreen E2E", "spatial");

  await page.getByRole("button", { name: "Enter canvas fullscreen" }).click();

  await expect.poll(() => fullscreenClass(page)).toContain("notes-canvas-shell");
  await expect(page.getByRole("button", { name: "Exit canvas fullscreen" })).toBeVisible();

  await page.getByRole("button", { name: "Exit canvas fullscreen" }).click();

  await expect.poll(() => fullscreenClass(page)).toBeNull();
  await expect(page.getByRole("button", { name: "Enter canvas fullscreen" })).toBeVisible();
});
