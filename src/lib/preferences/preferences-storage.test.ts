import { describe, expect, it } from "vitest";

import { getNotesDb, NOTES_DB_VERSION } from "../db/notes-db";
import { DEFAULT_PREFERENCES } from "./preferences-model";
import { readPreferences, writePreferences } from "./preferences-storage";

describe("preferences storage", () => {
  it("has a store of its own from version 12", async () => {
    const database = await getNotesDb();

    expect(NOTES_DB_VERSION).toBe(12);
    expect(database.objectStoreNames.contains("preferences")).toBe(true);
  });

  it("reads nothing before anything is written", async () => {
    const database = await getNotesDb();
    await database.clear("preferences");

    expect(await readPreferences()).toBeNull();
  });

  it("writes one row and reads it back", async () => {
    await writePreferences({ ...DEFAULT_PREFERENCES, accent: "green", updatedAt: 10 });
    await writePreferences({ ...DEFAULT_PREFERENCES, accent: "blue", updatedAt: 11 });

    const database = await getNotesDb();
    expect(await database.getAll("preferences")).toHaveLength(1);
    expect(await readPreferences()).toMatchObject({ accent: "blue", updatedAt: 11 });
  });

  it("validates what it reads rather than trusting the row", async () => {
    const database = await getNotesDb();
    await database.put("preferences", {
      ...DEFAULT_PREFERENCES,
      // A value from some later build, or a row edited by hand.
      accent: "chartreuse" as "rose",
    });

    expect((await readPreferences())?.accent).toBe("rose");
  });
});
