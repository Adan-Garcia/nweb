import { unwrap } from "idb";
import { beforeEach, describe, expect, it } from "vitest";

import { getNotesDb } from "../db/notes-db";
import {
  DEFAULT_INPUT_SETTINGS,
  readInputSettings,
  saveInputSettings,
} from "./input-settings-storage";

beforeEach(async () => {
  await (await getNotesDb()).clear("canvas-settings");
});

describe("input settings storage", () => {
  it("starts from the defaults and keeps what is saved", async () => {
    expect(await readInputSettings()).toEqual(DEFAULT_INPUT_SETTINGS);

    await saveInputSettings({ fingerDraws: true, stylusOnly: true });

    expect(await readInputSettings()).toEqual({ fingerDraws: true, stylusOnly: true });
  });

  it("falls back to the defaults for a row that does not parse", async () => {
    // Put through the raw store, which is what lets a row the types refuse past them.
    const database = await getNotesDb();
    await new Promise((resolve) => {
      unwrap(database)
        .transaction("canvas-settings", "readwrite")
        .objectStore("canvas-settings")
        .put({
          id: "input",
          fingerDraws: "sometimes",
          stylusOnly: false,
        }).onsuccess = resolve;
    });

    expect(await readInputSettings()).toEqual(DEFAULT_INPUT_SETTINGS);
  });
});
