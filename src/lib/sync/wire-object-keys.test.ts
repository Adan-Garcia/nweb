// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createAesGcmCipher,
  registerCipher,
  resetActiveCipher,
  setActiveCipher,
} from "../crypto/cipher";
import { getNotesDb } from "../db/notes-db";
import { createBranch, createFlight, createWing } from "../hierarchy/entity-storage";
import { createObjectKey, type Keyring } from "../keys/key-graph";
import { cipherForObject, forgetKeyring, holdKeyring } from "../keys/object-keys";
import { fromSyncRow, toSyncRow } from "./wire";

/**
 * Whether a row really travels under its own key, through the code that makes one.
 *
 * Hand-picked `keyId`s prove the server files rows correctly; this proves the client gives
 * it the right one. Sealing with the active cipher instead would stamp every row with the
 * wing's key, and a recipient granted one course would be served nothing.
 */
let wingKeyId = "";

async function seedWorkspace() {
  const wing = await createObjectKey("wing");
  const keyring: Keyring = new Map([[wing.keyId, wing.key]]);

  wingKeyId = wing.keyId;
  setActiveCipher(createAesGcmCipher(wing.key, wing.keyId));
  holdKeyring(keyring, {
    keys: [{ id: wing.keyId, kind: "wing", rotatedFrom: null }],
    wraps: [],
    grants: [],
  });

  const wingRow = await createWing("My wing");
  const flight = await createFlight({ wingId: wingRow.id, name: "Fall 2026" });
  const branch = await createBranch({ flightId: flight.id, name: "Thermodynamics" });
  const database = await getNotesDb();

  return { stored: (await database.get("branches", branch.id))! };
}

async function clearStores() {
  const database = await getNotesDb();

  for (const store of ["wings", "flights", "branches"] as const) {
    await database.clear(store);
  }
}

beforeEach(clearStores);

afterEach(async () => {
  forgetKeyring();
  resetActiveCipher();
  await clearStores();
});

describe("a row on its way to the server", () => {
  it("is filed under the object's own key, not the workspace's", async () => {
    const { stored } = await seedWorkspace();

    const wire = await toSyncRow("branches", stored);

    expect(wire.keyId).toBe(stored.keyId);
    expect(wire.keyId).not.toBe(wingKeyId);
  });

  it("opens with that key alone, which is all a recipient would hold", async () => {
    const { stored } = await seedWorkspace();
    const wire = await toSyncRow("branches", stored);
    const branchCipher = cipherForObject(stored.keyId);

    // Exactly what somebody granted that one course has: its key, and nothing above it.
    resetActiveCipher();
    forgetKeyring();
    registerCipher(branchCipher);

    expect(await fromSyncRow(wire)).toMatchObject({ id: stored.id });
  });

  it("stays shut for somebody holding only the workspace key", async () => {
    const { stored } = await seedWorkspace();
    const wire = await toSyncRow("branches", stored);
    const wingCipher = cipherForObject(wingKeyId);

    resetActiveCipher();
    forgetKeyring();
    registerCipher(wingCipher);

    // The wing key is above the course in the graph, but a key is not its own parent: the
    // recipient derives the course key by walking wraps, not by holding the root.
    expect(await fromSyncRow(wire)).toBeNull();
  });

  it("still uses the one key a workspace with no account has", async () => {
    const only = createAesGcmCipher(
      await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
        "encrypt",
        "decrypt",
      ]),
      "the-only-key",
    );

    setActiveCipher(only);

    const wire = await toSyncRow("branches", {
      id: "b1",
      updatedAt: 1,
      name: "Local",
      keyId: "the-only-key",
    });

    expect(wire.keyId).toBe("the-only-key");
  });
});
