import type { Page } from "@playwright/test";

import { PASSPHRASE, unlock, visit } from "./account";
import { expect, test } from "./fixtures";
import { createNote, openNotes, waitForAutosave } from "./helpers";

/**
 * jsdom cannot cover this: the real WebCrypto and the shipped Argon2id cost, a real
 * reload, and reading the stored rows back out of a real IndexedDB to check they are not
 * the note. The unit tests run the derivation at 1 MiB and a single pass.
 */
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
    // The fixture has already set up the local account, so the lock is on from the start.
    await openNotes(page);
    await createNote(page, "Biology", "linear");
    await page.locator(".ProseMirror").click();
    await page.keyboard.type(NOTE_BODY);
    await waitForAutosave(page);

    // Compressed, but plainly the note if it were unsealed: brotli leaves this text findable.
    expect(await storedDocumentBytes(page)).not.toContain("SECRET-MARKER");

    // And the names the app lists by, which are rows rather than payloads.
    expect((await storedNames(page)).names).not.toContain("Biology");

    // A reload drops the key from memory, so the workspace comes back locked.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Welcome back, Ada" })).toBeVisible();

    await page.getByLabel("Passphrase").fill("wrong passphrase");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("alert")).toContainText("does not unlock this workspace");

    await unlock(page);

    // Unlocked, and the note reads back exactly as it was written.
    await expect(page.locator(".ProseMirror")).toContainText("mitochondria");
  });

  test("a fresh page load locks it again, because the key is only in memory", async ({ page }) => {
    await openNotes(page);

    // Opening any other page from scratch finds it locked, not just a reload of this one.
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Welcome back, Ada" })).toBeVisible();
  });

  test("keep me signed in survives a reload, and Lock forgets it", async ({ page }) => {
    // A real IndexedDB has to hold a real CryptoKey across the reload; jsdom cannot say so.
    await page.goto("/dashboard");
    await page.getByLabel("Passphrase").fill(PASSPHRASE);
    await page.getByLabel("Keep me signed in for 30 days").check();
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByLabel("Passphrase")).toHaveCount(0);

    await page.keyboard.press("Control+k");
    await page.getByRole("option", { name: /Lock/ }).click();
    await expect(page.getByLabel("Passphrase")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Passphrase")).toBeVisible();
  });

  test("leaves a task's due date readable, which is what a reminder would need", async ({
    page,
  }) => {
    await visit(page, "/calendar");
    await page.getByRole("button", { name: "Add Event" }).click();
    await page.getByLabel("Title").fill("SECRET-TASK problem set");
    await page.getByLabel("Date").fill("2026-10-01");
    await page.getByRole("button", { name: "Create event" }).click();
    await expect(page.getByText("SECRET-TASK problem set").first()).toBeVisible();

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

    await visit(page, "/settings");
    await page.getByRole("button", { name: "Change passphrase" }).click();
    await page.getByLabel("Current passphrase").fill(PASSPHRASE);
    await page.getByLabel("New passphrase").fill("second passphrase entirely");
    await page.getByRole("button", { name: "Re-encrypt with the new passphrase" }).click();
    await expect(page.getByRole("button", { name: "Change passphrase" })).toBeEnabled({
      timeout: 30_000,
    });

    // Never readable in between, and only the new passphrase opens it afterwards.
    expect(await storedDocumentBytes(page)).not.toContain("SECRET-MARKER");

    await page.reload();
    await page.getByLabel("Passphrase").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("alert")).toContainText("does not unlock this workspace");

    await unlock(page, "second passphrase entirely");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

    await page.getByRole("link", { name: "Notes", exact: true }).click();
    await expect(page.locator(".ProseMirror")).toContainText("mitochondria");
    await expect(page.getByRole("button", { name: "Biology" })).toBeVisible();
  });

  test("erasing the device forgets everything and starts over", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Biology", "linear");

    await visit(page, "/settings");
    await page.getByRole("button", { name: "Delete this device's account" }).click();
    await page.getByLabel("Your passphrase").fill(PASSPHRASE);
    await page.getByLabel("Type ERASE to confirm").fill("ERASE");
    await page.getByRole("button", { name: "Erase this device" }).click();

    await expect(page).toHaveURL(/\/auth\/signup$/, { timeout: 30_000 });
    await expect(page.getByLabel("Confirm passphrase")).toBeVisible();
    await reloadIsStillSignup(page);
  });
});

/** Nothing of the old account is left to open: a reload still asks for a new one. */
async function reloadIsStillSignup(page: Page) {
  await page.reload();
  await expect(page.getByLabel("Confirm passphrase")).toBeVisible();
}

test.describe("a device with no account", () => {
  test.use({ signedUp: false });

  test("is sent to create one before any workspace page opens", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/auth\/signup$/);
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });
});
