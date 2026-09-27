import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { createNote, openNotes, waitForAutosave } from "./helpers";

/**
 * jsdom cannot cover this: the real WebCrypto and the shipped Argon2id cost, a real
 * reload, and reading the stored rows back out of a real IndexedDB to check they are not
 * the note. The unit tests run the derivation at 1 MiB and a single pass.
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

/** Every stored name, as text: the titles the workspace is listed and sorted by. */
async function storedNames(page: Page) {
  return page.evaluate(async () => {
    const open = indexedDB.open("cuervo-notes");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(new Error(open.error?.message ?? "could not open"));
    });

    const read = (store: string, field: string) =>
      new Promise<string[]>((resolve, reject) => {
        const request = database.transaction(store, "readonly").objectStore(store).getAll();
        request.onsuccess = () =>
          resolve(request.result.map((row: Record<string, string>) => row[field] ?? ""));
        request.onerror = () => reject(new Error(request.error?.message ?? "could not read"));
      });

    const names = [
      ...(await read("notes-directory", "feather")),
      ...(await read("branches", "name")),
      ...(await read("twigs", "title")),
    ];

    const dates = (await read("twigs", "dueDate")).filter(Boolean);

    database.close();

    return { names: names.join(" "), dates };
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

    // And the names the app lists by, which are rows rather than payloads.
    const stored = await storedNames(page);
    expect(stored.names).not.toContain("Biology");

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

  test("leaves a task's due date readable, which is what a reminder would need", async ({
    page,
  }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Add Event" }).click();
    await page.getByLabel("Title").fill("SECRET-TASK problem set");
    await page.getByLabel("Date").fill("2026-10-01");
    await page.getByRole("button", { name: "Create event" }).click();
    await expect(page.getByText("SECRET-TASK problem set").first()).toBeVisible();

    await page.goto("/settings");
    await page.getByRole("button", { name: "Set a passphrase" }).click();
    await page.getByLabel("Choose a passphrase").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Encrypt this workspace" }).click();
    await expect(page.getByRole("button", { name: "Lock now" })).toBeVisible({ timeout: 30_000 });

    const stored = await storedNames(page);

    // The title is gone from the row; the date beside it is not. That is the line the lock
    // draws on purpose, so a server holding only ciphertext could still say "due at nine".
    expect(stored.names).not.toContain("SECRET-TASK");
    expect(stored.dates).toContain("2026-10-01");
  });

  test("changes the passphrase in one pass, without writing the notes back readable", async ({
    page,
  }) => {
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

    await page.getByRole("button", { name: "Change the passphrase" }).click();
    await page.getByLabel("Current passphrase").fill(PASSPHRASE);
    await page.getByLabel("New passphrase").fill("second passphrase entirely");
    await page.getByRole("button", { name: "Re-encrypt with the new passphrase" }).click();
    await expect(page.getByRole("button", { name: "Change the passphrase" })).toBeEnabled({
      timeout: 30_000,
    });

    // Never readable in between, and only the new passphrase opens it afterwards.
    expect(await storedDocumentBytes(page)).not.toContain("SECRET-MARKER");

    await page.reload();
    await page.getByLabel("Passphrase").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("alert")).toContainText("does not unlock this workspace");

    await page.getByLabel("Passphrase").fill("second passphrase entirely");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

    await page.getByRole("link", { name: "Notes", exact: true }).click();
    await expect(page.locator(".ProseMirror")).toContainText("mitochondria");
    await expect(page.getByRole("button", { name: "Biology" })).toBeVisible();
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
