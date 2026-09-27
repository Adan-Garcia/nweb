import { reload } from "./account";
import { expect, test } from "./fixtures";
import { createNote, openNotes } from "./helpers";

/**
 * jsdom cannot cover this: the tombstone only works if a deleted note stays hidden after a
 * real reload, against a real IndexedDB that survives the page. A unit test reads the same
 * process it wrote in.
 */
test.describe("deleting a note", () => {
  test("keeps it gone after a reload and leaves the other notes alone", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Keep This", "linear");
    await createNote(page, "Delete This", "linear", "Keep This");

    await page.getByRole("button", { name: "Delete Note" }).click();
    const confirmation = page.getByRole("dialog");
    await expect(confirmation).toContainText("Delete This");
    await confirmation.getByRole("button", { name: "Delete Note" }).click();

    // The note that was open is gone, and the most recent survivor takes its place.
    await expect(page.getByRole("button", { name: "Keep This" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete This" })).toBeHidden();

    await reload(page);
    await openNotes(page);

    await expect(page.getByRole("button", { name: "Keep This" })).toBeVisible();

    // And it is absent from the note menu, not merely unopened.
    await page.getByRole("button", { name: "Keep This" }).click();
    await expect(page.getByRole("menuitem", { name: "Untitled note" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete This" })).toBeHidden();
  });
});
