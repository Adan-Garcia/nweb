import { describe, expect, it } from "vitest";

import { eraseNotesDb, getNotesDb, NOTES_DB_VERSION } from "./notes-db";

describe("the notes database", () => {
  it("has a store for the local account from version 13", async () => {
    const database = await getNotesDb();

    expect(NOTES_DB_VERSION).toBeGreaterThanOrEqual(13);
    expect(database.objectStoreNames.contains("local-account")).toBe(true);
  });

  it("erases itself completely, and opens empty afterwards", async () => {
    const database = await getNotesDb();
    await database.put("local-account", {
      id: "self",
      name: "Ada",
      email: "ada@example.com",
      createdAt: 1,
      updatedAt: 1,
    });

    await eraseNotesDb();

    expect(await (await getNotesDb()).count("local-account")).toBe(0);
  });

  it("steps aside when another tab erases or upgrades it, and reopens on the next call", async () => {
    const first = await getNotesDb();

    // What erasing the device in another tab does. It completes only if this tab lets go.
    await new Promise<void>((resolve) => {
      indexedDB.deleteDatabase("cuervo-notes").onsuccess = () => resolve();
    });

    const reopened = await getNotesDb();
    expect(reopened).not.toBe(first);
    expect(reopened.objectStoreNames.contains("local-account")).toBe(true);
  });
});
