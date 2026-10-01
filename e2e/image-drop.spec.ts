import { reload } from "./account";
import { expect, test } from "./fixtures";
import { createNote, dropImage, inkPixels, openNotes } from "./helpers";

test.describe("dropping an image onto the canvas", () => {
  test("adds the image, optimizes it in the worker, and keeps it after a reload", async ({
    page,
  }) => {
    await openNotes(page);
    await createNote(page, "Drop E2E", "spatial");
    expect(await inkPixels(page)).toBe(0);

    await dropImage(page);

    await expect.poll(() => inkPixels(page)).toBeGreaterThan(2000);
    await expect(page.getByText(/^Autosaved at/)).toBeVisible();

    await reload(page);

    await expect(page.getByRole("button", { name: "Drop E2E" })).toBeVisible();
    await expect.poll(() => inkPixels(page)).toBeGreaterThan(2000);
  });
});
