// @vitest-environment node
import type { SyncRow } from "@shared/sync-contract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createObjectKey } from "../keys/key-graph";
import { forgetKeyring, holdKeyring } from "../keys/object-keys";
import { getNotesDb } from "../notes-db";
import { twigSchema } from "../twig-model";
import { reconcileRow } from "./reconcile";
import { type StoredRow, toSyncRow } from "./wire";

/** A task row, plaintext: the rule under test is the same for every store. */
function twig(title: string, updatedAt: number, extra: Partial<StoredRow> = {}): StoredRow {
  return {
    id: "twig-1",
    branchId: "branch-1",
    nestIds: [],
    title,
    kind: "homework",
    status: "incomplete",
    dueDate: null,
    dueTime: "",
    dueMinutes: null,
    timeZone: "",
    notes: "",
    boardOrder: 0,
    createdAt: 1,
    updatedAt,
    deletedAt: null,
    ...extra,
  };
}

const wire = (row: StoredRow) => toSyncRow("twigs", row);

async function stored() {
  return (await getNotesDb()).get("twigs", "twig-1");
}

async function storeLocally(row: StoredRow) {
  const database = await getNotesDb();

  await database.put("twigs", twigSchema.parse(row));
}

beforeEach(async () => {
  const database = await getNotesDb();

  await Promise.all([database.clear("twigs"), database.clear("sync-bases")]);
});

afterEach(() => {
  forgetKeyring();
});

describe("reconcileRow", () => {
  it("stores a row this device has never seen, and remembers it as the base", async () => {
    const row = await wire(twig("Essay", 10));

    expect(await reconcileRow(row)).toBe(true);
    expect((await stored())?.title).toBe("Essay");
    expect((await (await getNotesDb()).get("sync-bases", "twigs:twig-1"))?.row).toEqual(row);
  });

  it("does nothing when its own write comes back", async () => {
    await storeLocally(twig("Essay", 10));

    expect(await reconcileRow(await wire(twig("Essay", 10)))).toBe(false);
  });

  it("takes their edit when nothing changed here since the base", async () => {
    await reconcileRow(await wire(twig("Essay", 10)));

    expect(await reconcileRow(await wire(twig("Essay draft", 20)))).toBe(true);
    expect((await stored())?.title).toBe("Essay draft");
  });

  it("merges when both sides changed since the base, and stamps the merge newest", async () => {
    await reconcileRow(await wire(twig("Essay", 10)));
    await storeLocally(twig("Essay", 30, { status: "complete" }));

    expect(await reconcileRow(await wire(twig("Essay draft", 20)))).toBe(true);

    const merged = await stored();

    // Their rename and this device's status change, both kept.
    expect(merged).toMatchObject({ title: "Essay draft", status: "complete" });
    expect(merged!.updatedAt).toBeGreaterThan(30);
  });

  it("keeps a newer local edit when there is no base to merge against", async () => {
    await storeLocally(twig("Mine", 30));

    expect(await reconcileRow(await wire(twig("Theirs", 20)))).toBe(false);
    expect((await stored())?.title).toBe("Mine");
  });

  it("falls back to last write wins when the base can no longer be opened", async () => {
    const database = await getNotesDb();
    const base = await wire(twig("Essay", 10));

    await database.put("sync-bases", {
      id: "twigs:twig-1",
      row: { ...base, payload: "not-a-payload" },
    });
    await storeLocally(twig("Essay", 15, { status: "complete" }));

    expect(await reconcileRow(await wire(twig("Essay draft", 20)))).toBe(true);
    expect(await stored()).toMatchObject({ title: "Essay draft", status: "incomplete" });
  });

  it("falls back to last write wins when this side cannot be opened to merge", async () => {
    await reconcileRow(await wire(twig("Essay", 10)));
    // A title sealed under a key this device no longer holds.
    await storeLocally(twig("sealed", 15, { encryption: "aes-gcm", keyId: "gone" }));

    expect(await reconcileRow(await wire(twig("Essay draft", 20)))).toBe(true);
    expect((await stored())?.title).toBe("Essay draft");
  });

  it("ignores a row it cannot open", async () => {
    const row: SyncRow = { ...(await wire(twig("Essay", 10))), payload: "@@@" };

    expect(await reconcileRow(row)).toBe(false);
    expect(await stored()).toBeUndefined();
  });

  it("gives a reader the server's version outright, healing a copy that drifted", async () => {
    const shared = await createObjectKey("twig");

    holdKeyring(new Map([[shared.keyId, shared.key]]), {
      keys: [],
      wraps: [],
      grants: [{ keyId: shared.keyId, role: "reader", wrapped: "w" }],
    });

    await storeLocally(twig("My local typing", 99, { keyId: shared.keyId }));

    expect(await reconcileRow(await wire(twig("The real one", 20, { keyId: shared.keyId })))).toBe(
      true,
    );
    expect((await stored())?.title).toBe("The real one");
  });
});
