import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { createNote, drawingCanvas, drawStroke, inkPixels, openNotes } from "./helpers";

/** A point on the canvas as fractions of its size, in page coordinates. */
async function pointer(page: Page) {
  const box = await drawingCanvas(page).boundingBox();
  if (!box) throw new Error("canvas is not visible");

  return (fx: number, fy: number, dy = 0) =>
    [box.x + box.width * fx, box.y + box.height * fy + dy] as const;
}

/** Loops the lasso around the stroke `drawStroke` draws by default. */
async function lassoTheStroke(page: Page) {
  const at = await pointer(page);
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
}

/** A lasso press on empty canvas: selects nothing, so the selection box is not counted as ink. */
async function deselect(page: Page) {
  const at = await pointer(page);
  await page.mouse.click(...at(0.05, 0.1));
}

test.describe("editing a drawing", () => {
  test("a selection grows by dragging its corner", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Resize E2E", "spatial");
    await drawStroke(page);
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(50);
    const before = await inkPixels(page);
    const at = await pointer(page);

    await lassoTheStroke(page);
    // `drawStroke` ends a quarter of the width across and 40 pixels down: the box's corner.
    await page.mouse.move(...at(0.65, 0.6, 40));
    await page.mouse.down();
    await page.mouse.move(...at(0.85, 0.6, 72), { steps: 8 });
    await page.mouse.up();
    await deselect(page);

    await expect.poll(() => inkPixels(page)).toBeGreaterThan(before * 1.4);
  });

  test("a copied selection pastes back as a second copy", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Copy E2E", "spatial");
    await drawStroke(page);
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(50);
    const before = await inkPixels(page);

    await lassoTheStroke(page);
    const bar = page.getByRole("toolbar", { name: "Selection" });
    await bar.getByRole("button", { name: "Copy" }).click();
    await bar.getByRole("button", { name: "Paste" }).click();
    // The paste comes in selected; move it clear of the original.
    const at = await pointer(page);
    await page.mouse.move(...at(0.5, 0.5));
    await page.mouse.down();
    await page.mouse.move(...at(0.5, 0.2), { steps: 8 });
    await page.mouse.up();
    await deselect(page);

    await expect.poll(() => inkPixels(page)).toBeGreaterThan(before * 1.6);
  });

  test("a drawing exports as a PDF", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Export E2E", "spatial");
    await drawStroke(page);

    await page.getByRole("button", { name: "More" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export as PDF" }).click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    const file = Buffer.concat(chunks);

    expect(download.suggestedFilename()).toMatch(/^drawing-.*\.pdf$/);
    expect(file.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    // A real JPEG of the page, not a blank one: well past the PDF's own few hundred bytes.
    expect(file.length).toBeGreaterThan(5000);
  });

  test("a paged note's thumbnails show what is written on each page", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Thumbs E2E", "spatial", "Untitled note", "paged");
    await drawStroke(page, { x: 0.4, y: 0.4 });
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(50);

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "Page thumbnails" }).click();
    const thumbnail = page.getByRole("button", { name: "Page 1" }).locator("canvas");

    // Drawn small, the line is antialiased to grey rather than black: count what is darker than paper.
    await expect
      .poll(() =>
        thumbnail.evaluate((canvas) => {
          if (!(canvas instanceof HTMLCanvasElement)) return -1;
          const { data } = canvas
            .getContext("2d")
            ?.getImageData(0, 0, canvas.width, canvas.height) ?? {
            data: [],
          };
          let dark = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 200 && data[i] + data[i + 1] + data[i + 2] < 650) dark += 1;
          }
          return dark;
        }),
      )
      .toBeGreaterThan(3);
  });
});
