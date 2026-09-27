import { readFile } from "node:fs/promises";

import { expect, test } from "./fixtures";
import { createNote, openNotes } from "./helpers";

/**
 * jsdom cannot cover the whole of this: the real WebCrypto at the real iteration count,
 * a file that actually leaves the browser as a download, and the same file going back in
 * through a file input. The unit tests run the crypto at 100 iterations; this is the only
 * place the shipped 600,000 is exercised.
 */
test.describe("an encrypted backup", () => {
  test("downloads unreadable, and restores only with the passphrase", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Secret Lecture", "linear");

    await page.goto("/settings");
    await page.getByRole("button", { name: "Encrypt a backup" }).click();
    await page.getByLabel("Passphrase for this backup").fill("correct horse battery");

    const download = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download encrypted backup" }).click(),
    ]).then(([event]) => event);

    expect(download.suggestedFilename()).toMatch(
      /^cuervo-planner-backup-\d{4}-\d{2}-\d{2}-encrypted\.json$/,
    );

    const path = await download.path();
    const contents = await readFile(path, "utf8");

    // The note's title would be sitting in a plaintext export.
    expect(contents).not.toContain("Secret Lecture");
    expect(JSON.parse(contents)).toMatchObject({
      format: "cuervo-planner-encrypted",
      cipher: "AES-GCM",
      kdf: { name: "Argon2id", memorySize: 65536, iterations: 3, parallelism: 1 },
    });

    // The download is confirmed by a toast, which says what went into the file.
    await expect(page.getByText("Backup downloaded")).toBeVisible();
    await expect(page.getByText(/tasks, encrypted\./)).toBeVisible();

    // Restoring it asks for the passphrase rather than calling it an invalid file.
    await page.getByRole("button", { name: "Restore from file" }).click();
    await page.getByLabel("Backup file").setInputFiles(path);
    await expect(page.getByLabel("This backup is encrypted")).toBeVisible();

    await page.getByLabel("This backup is encrypted").fill("wrong passphrase");
    await page.getByRole("button", { name: "Unlock and restore" }).click();
    await expect(page.getByRole("status")).toContainText("does not open this file");

    await page.getByLabel("This backup is encrypted").fill("correct horse battery");
    await page.getByRole("button", { name: "Unlock and restore" }).click();
    await expect(page.getByRole("status")).toContainText("Restored");

    // And the note really came back.
    await page.goto("/notes");
    await openNotes(page);
    await expect(page.getByRole("button", { name: "Secret Lecture" })).toBeVisible();
  });
});
