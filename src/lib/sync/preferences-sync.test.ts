// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { getNotesDb } from "../notes-db";
import { DEFAULT_PREFERENCES, type Preferences } from "../preferences-model";
import { readPreferences, writePreferences } from "../preferences-storage";
import { mergeStoredRows } from "./merge-row";
import { reconcileRow } from "./reconcile";
import { fromSyncRow, toSyncRow } from "./wire";

const prefs = (patch: Partial<Preferences>): Preferences => ({ ...DEFAULT_PREFERENCES, ...patch });

beforeEach(async () => {
  const database = await getNotesDb();

  await Promise.all([database.clear("preferences"), database.clear("sync-bases")]);
});

describe("preferences over sync", () => {
  it("travel sealed and come back as the same preferences", async () => {
    const row = await toSyncRow("preferences", prefs({ accent: "teal", updatedAt: 5 }));

    expect(row).toMatchObject({ store: "preferences", id: "self", schedule: null });
    expect(row.payload).not.toContain("teal");
    expect(await fromSyncRow(row)).toMatchObject({ accent: "teal", updatedAt: 5 });
  });

  it("arrive on a device that has none", async () => {
    await reconcileRow(await toSyncRow("preferences", prefs({ theme: "paper", updatedAt: 5 })));

    expect((await readPreferences())?.theme).toBe("paper");
  });

  it("keep one device's accent and another's density when both changed", async () => {
    const base = prefs({ updatedAt: 10 });
    // This device saw the base, then changed its accent.
    await reconcileRow(await toSyncRow("preferences", base));
    await writePreferences(prefs({ accent: "violet", updatedAt: 20 }));

    // Meanwhile another device changed the density.
    await reconcileRow(
      await toSyncRow("preferences", prefs({ density: "compact", updatedAt: 30 })),
    );

    const merged = await readPreferences();
    expect(merged).toMatchObject({ accent: "violet", density: "compact" });
    expect(merged?.updatedAt).toBeGreaterThan(30);
  });

  it("are merged field by field, with nothing to open or seal", async () => {
    const merged = await mergeStoredRows(
      "preferences",
      {
        base: prefs({ updatedAt: 1 }),
        local: prefs({ fontSize: "lg", updatedAt: 2 }),
        remote: prefs({ theme: "oled", updatedAt: 3 }),
      },
      "remote",
    );

    expect(merged).toMatchObject({ fontSize: "lg", theme: "oled", encryption: undefined });
  });
});
