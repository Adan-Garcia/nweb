import { expect, test } from "./fixtures";
import { createNote, drawStroke, inkPixels, openNotes, waitForAutosave } from "./helpers";

test.describe("the spatial canvas (real Excalidraw)", () => {
  test("a drawn stroke is autosaved and is still there after a reload", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Canvas E2E", "spatial");
    expect(await inkPixels(page)).toBe(0);

    await drawStroke(page);
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(50);
    await waitForAutosave(page);
    const drawn = await inkPixels(page);

    await page.reload();

    // The app reopens the most recently updated note, which is this one.
    await expect(page.getByRole("button", { name: "Canvas E2E" })).toBeVisible();
    await expect(page.locator(".notes-canvas-shell canvas.static")).toBeVisible();
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(drawn * 0.5);
  });

  test("a new spatial note starts with an empty canvas", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Empty canvas", "spatial");

    expect(await inkPixels(page)).toBe(0);
  });
});
