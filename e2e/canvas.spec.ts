import { reload } from "./account";
import { expect, test } from "./fixtures";
import {
  createNote,
  drawingCanvas,
  drawStroke,
  inkPixels,
  openNotes,
  waitForAutosave,
} from "./helpers";

test.describe("the drawing canvas", () => {
  test("a drawn stroke is autosaved and is still there after a reload", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Canvas E2E", "spatial");
    expect(await inkPixels(page)).toBe(0);

    await drawStroke(page);
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(50);
    await waitForAutosave(page);
    const drawn = await inkPixels(page);

    await reload(page);

    // The app reopens the most recently updated note, which is this one.
    await expect(page.getByRole("button", { name: "Canvas E2E" })).toBeVisible();
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(drawn * 0.5);
  });

  test("a new spatial note starts with an empty canvas", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Empty canvas", "spatial");

    expect(await inkPixels(page)).toBe(0);
  });

  test("the stroke eraser takes a stroke away, and undo brings it back", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Eraser E2E", "spatial");
    await drawStroke(page);
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(50);

    const box = await drawingCanvas(page).boundingBox();
    if (!box) throw new Error("canvas is not visible");
    await page.getByRole("button", { name: "Stroke eraser" }).click();
    // Straight down through the middle of the stroke.
    const x = box.x + box.width * 0.525;
    await page.mouse.move(x, box.y + box.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(x, box.y + box.height * 0.8, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => inkPixels(page)).toBe(0);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(50);
  });

  test("a lasso picks up a stroke and drags it somewhere else", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Lasso E2E", "spatial");
    await drawStroke(page);
    await waitForAutosave(page);
    const box = await drawingCanvas(page).boundingBox();
    if (!box) throw new Error("canvas is not visible");
    const at = (fx: number, fy: number) =>
      [box.x + box.width * fx, box.y + box.height * fy] as const;
    const pixelAt = (fx: number, fy: number) =>
      drawingCanvas(page).evaluate(
        (live, [x, y]) => {
          const canvas = live.previousElementSibling;
          const context = canvas instanceof HTMLCanvasElement ? canvas.getContext("2d") : null;
          const scale = canvas instanceof HTMLCanvasElement ? canvas.width / live.clientWidth : 1;
          return context?.getImageData(x * scale, y * scale, 1, 1).data[3] ?? 0;
        },
        [box.width * fx, box.height * fy],
      );

    await page.getByRole("button", { name: "Lasso", exact: true }).click();
    await page.mouse.move(...at(0.35, 0.5));
    await page.mouse.down();
    for (const [fx, fy] of [
      [0.7, 0.5],
      [0.7, 0.75],
      [0.35, 0.75],
      [0.35, 0.5],
    ]) {
      await page.mouse.move(...at(fx, fy), { steps: 4 });
    }
    await page.mouse.up();

    // Drag the selection up by a fifth of the canvas.
    await page.mouse.move(...at(0.5, 0.65));
    await page.mouse.down();
    await page.mouse.move(...at(0.5, 0.45), { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => pixelAt(0.4, 0.6)).toBe(0);
    await expect.poll(() => pixelAt(0.4, 0.4)).toBeGreaterThan(200);
  });

  test("a paged note draws on its pages and can take another", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Paged E2E", "spatial", "Untitled note", "paged");
    expect(await inkPixels(page)).toBe(0);

    await drawStroke(page, { x: 0.4, y: 0.4 });
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(50);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "Add page" }).click();
    await waitForAutosave(page);

    await reload(page);
    await expect(page.getByRole("button", { name: "Paged E2E" })).toBeVisible();
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(50);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "Page thumbnails" }).click();
    await expect(page.getByRole("button", { name: "Page 2" })).toBeVisible();
  });
});
