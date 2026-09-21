import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { createNote, openNotes, waitForAutosave } from "./helpers";

/**
 * jsdom cannot cover this: the real WebCrypto at the shipped 600,000 iterations, a real
 * reload, and reading the stored bytes back out of a real IndexedDB to check they are not
 * the note. The unit tests run the derivation at 100 iterations.
 */
const PASSPHRASE = "correct horse battery staple";
const NOTE_BODY = "SECRET-MARKER the mitochondria is the powerhouse of the cell";

/** Everything the documents store holds, as text, so it can be searched for the note. */
async function storedDocumentBytes(page: Page) {
  return page.evaluate(async () => {
    const open = indexedDB.open("cuervo-notes");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(new Error(open.error?.message ?? "could not open"));
    });

    const rows = await new Promise<{ linearCompressed: Uint8Array | null }[]>((resolve, reject) => {
      const request = database
        .transaction("notes-documents", "readonly")
        .objectStore("notes-documents")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(request.error?.message ?? "could not read"));
    });

    database.close();

    return rows
      .map((row) => (row.linearCompressed ? new TextDecoder().decode(row.linearCompressed) : ""))
      .join("");
  });
}

test.describe("the workspace lock", () => {
  test("encrypts what is stored, and asks for the passphrase after a reload", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Biology", "linear");
    await page.locator(".ProseMirror").click();
    await page.keyboard.type(NOTE_BODY);
    await waitForAutosave(page);

    // Compressed, but plainly the note: brotli leaves this text findable at this length.
    await page.goto("/settings");
    await page.getByRole("button", { name: "Set a passphrase" }).click();
    await page.getByLabel("Choose a passphrase").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Encrypt this workspace" }).click();

    // Once the rekey is done the card offers to lock, which is how we know it finished.
    await expect(page.getByRole("button", { name: "Lock now" })).toBeVisible({ timeout: 30_000 });

    const sealed = await storedDocumentBytes(page);
    expect(sealed).not.toContain("SECRET-MARKER");

    // A reload drops the key from memory, so the workspace comes back locked.
    await page.reload();
    await expect(page.getByRole("heading", { name: /This workspace is locked/ })).toBeVisible();

    await page.getByLabel("Passphrase").fill("wrong passphrase");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("alert")).toContainText("does not unlock this workspace");

    await page.getByLabel("Passphrase").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Unlock" }).click();

    // Unlocked, and the note reads back exactly as it was written. Navigated by clicking,
    // not page.goto: the key lives in memory, so a full page load re-locks by design.
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await page.getByRole("link", { name: "Notes", exact: true }).click();
    await expect(page.locator(".ProseMirror")).toContainText("mitochondria");
  });

  test("a fresh page load locks it again, because the key is only in memory", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Biology", "linear");

    await page.goto("/settings");
    await page.getByRole("button", { name: "Set a passphrase" }).click();
    await page.getByLabel("Choose a passphrase").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Encrypt this workspace" }).click();
    await expect(page.getByRole("button", { name: "Lock now" })).toBeVisible({ timeout: 30_000 });

    // Opening any other page from scratch finds it locked, not just a reload of this one.
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /This workspace is locked/ })).toBeVisible();
  });

  test("removing the passphrase writes the notes back readable", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Biology", "linear");
    await page.locator(".ProseMirror").click();
    await page.keyboard.type(NOTE_BODY);
    await waitForAutosave(page);

    await page.goto("/settings");
    await page.getByRole("button", { name: "Set a passphrase" }).click();
    await page.getByLabel("Choose a passphrase").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Encrypt this workspace" }).click();
    await expect(page.getByRole("button", { name: "Lock now" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Remove the passphrase" }).click();
    await page.getByLabel("Confirm the passphrase").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Remove and decrypt" }).click();

    await expect(page.getByRole("button", { name: "Set a passphrase" })).toBeVisible({
      timeout: 30_000,
    });

    // No lock screen after a reload, and the note is still there.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await page.goto("/notes");
    await openNotes(page);
    await expect(page.locator(".ProseMirror")).toContainText("mitochondria");
  });
});
