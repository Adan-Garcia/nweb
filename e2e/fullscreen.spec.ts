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

test("the canvas covers the window where the browser has no fullscreen for it", async ({
  page,
}) => {
  // Safari on an iPhone has no element fullscreen at all.
  await page.addInitScript(() => {
    Reflect.deleteProperty(Element.prototype, "requestFullscreen");
  });
  await openNotes(page);
  await createNote(page, "Covering E2E", "spatial");
  const shell = page.locator("section").filter({ has: page.getByRole("toolbar") });
  const viewport = page.viewportSize();

  await page.getByRole("button", { name: "Enter canvas fullscreen" }).click();

  await expect
    .poll(async () => {
      const box = await shell.boundingBox();
      return box && { x: box.x, y: box.y, width: box.width, height: box.height };
    })
    .toEqual({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });

  await page.getByRole("button", { name: "Exit canvas fullscreen" }).click();

  await expect
    .poll(async () => (await shell.boundingBox())?.width)
    .toBeLessThan(viewport?.width ?? 0);
});
