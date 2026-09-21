import { expect, test } from "./fixtures";
import { createNote, inkPixels, makePdf, openNotes } from "./helpers";

const FILE_INPUT = 'input[type="file"][accept*="pdf"]';

test.describe("importing a PDF onto the canvas (real pdf.js)", () => {
  test.beforeEach(async ({ page }) => {
    await openNotes(page);
    await createNote(page, "PDF E2E", "spatial");
  });

  test("asks which pages to import, then draws the chosen ones", async ({ page }) => {
    const prompts: string[] = [];
    page.on("dialog", async (dialog) => {
      prompts.push(dialog.message());
      await dialog.accept("1-2");
    });

    await page.locator(FILE_INPUT).setInputFiles({
      name: "notes.pdf",
      mimeType: "application/pdf",
      buffer: makePdf(3),
    });

    await expect(page.getByText("Inserted 2 pages (1-2).")).toBeVisible();
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("This PDF has 3 pages");
    // The rendered pages are images on the canvas.
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(200);
  });

  test("a one-page PDF is inserted without asking", async ({ page }) => {
    let asked = false;
    page.on("dialog", async (dialog) => {
      asked = true;
      await dialog.dismiss();
    });

    await page.locator(FILE_INPUT).setInputFiles({
      name: "single.pdf",
      mimeType: "application/pdf",
      buffer: makePdf(1),
    });

    await expect.poll(() => inkPixels(page)).toBeGreaterThan(200);
    expect(asked).toBe(false);
  });

  test("cancelling the page prompt inserts nothing", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.dismiss());

    await page.locator(FILE_INPUT).setInputFiles({
      name: "notes.pdf",
      mimeType: "application/pdf",
      buffer: makePdf(2),
    });

    // Give the import time to (not) happen.
    await page.waitForTimeout(1500);
    expect(await inkPixels(page)).toBe(0);
    await expect(page.getByText(/Inserted/)).toBeHidden();
  });

  test("an invalid page selection is reported, not silently ignored", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept("99"));

    await page.locator(FILE_INPUT).setInputFiles({
      name: "notes.pdf",
      mimeType: "application/pdf",
      buffer: makePdf(2),
    });

    await expect(page.getByText(/Could not import PDF/)).toBeVisible();
    expect(await inkPixels(page)).toBe(0);
  });

  test("a file that is not a PDF is rejected", async ({ page }) => {
    await page.locator(FILE_INPUT).setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from("not a pdf"),
    });

    await expect(page.getByText("Please choose a PDF file.")).toBeVisible();
    expect(await inkPixels(page)).toBe(0);
  });

  test("the imported pages survive a reload", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept("1"));
    await page.locator(FILE_INPUT).setInputFiles({
      name: "notes.pdf",
      mimeType: "application/pdf",
      buffer: makePdf(2),
    });
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(200);
    await expect(page.getByText(/^Autosaved at/)).toBeVisible();

    await page.reload();

    await expect(page.getByRole("button", { name: "PDF E2E" })).toBeVisible();
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(200);
  });
});
