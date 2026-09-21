import { expect, test } from "./fixtures";
import { createNote, openNotes, waitForAutosave } from "./helpers";

/**
 * jsdom cannot cover this: the unit tests load brotli-wasm through the package's Node
 * build, so they never exercise the web build, which fetches its `.wasm` by a URL Vite
 * rewrites at build time. That path only exists in a real browser, and it is the one that
 * silently fell through to gzip before.
 */
test.describe("stored notes are compressed with brotli", () => {
  test("a saved note records brotli as its algorithm and reads back intact", async ({ page }) => {
    await openNotes(page);
    await createNote(page, "Compression E2E", "linear");

    const body = "Brotli compresses repeated prose well. ".repeat(40);
    await page.locator(".ProseMirror").click();
    await page.keyboard.type(body);

    await waitForAutosave(page);

    const stored = await page.evaluate(async () => {
      const open = indexedDB.open("cuervo-notes");
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () =>
          reject(new Error(open.error?.message ?? "could not open the database"));
      });

      const rows = await new Promise<{ linearCompressionAlgorithm: string | null }[]>(
        (resolve, reject) => {
          const request = database
            .transaction("notes-documents", "readonly")
            .objectStore("notes-documents")
            .getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () =>
            reject(new Error(request.error?.message ?? "could not read the documents"));
        },
      );

      database.close();

      return rows.map((row) => row.linearCompressionAlgorithm);
    });

    // Every note that has been written carries brotli, not the gzip it used to fall to.
    expect(stored).toContain("brotli");
    expect(stored).not.toContain("gzip");

    // And it is really readable: the worker decompresses it back after a reload.
    await page.reload();
    await openNotes(page);
    await expect(page.locator(".ProseMirror")).toContainText("Brotli compresses repeated prose");
  });
});
