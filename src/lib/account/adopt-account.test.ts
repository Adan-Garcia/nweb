// @vitest-environment node
//
// Node, not jsdom: adoption rewrites stored media, and fake-indexeddb flattens a jsdom Blob
// into a bare object with no arrayBuffer(). Node's Blob survives.
import { afterEach, describe, expect, it, vi } from "vitest";

import { getActiveCipher, resetActiveCipher } from "../cipher";
import { createBranch, listBranches } from "../entity-storage";
import { getNotesDb } from "../notes-db";
import { loadNotesDocument, saveLinearDocumentPayload } from "../notes-document-storage";
import { createWorkspaceLock } from "../workspace-passphrase";
import { readAccountRecord } from "./account-record";
import { adoptAccount, forgetAccount, unlockAccount } from "./adopt-account";

// Argon2id at its real cost is a second per call and this suite derives several times.
vi.mock("../kdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../kdf")>()),
  createKdfParams: () => ({
    name: "Argon2id" as const,
    memorySize: 1024,
    iterations: 1,
    parallelism: 1,
    salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
  }),
}));

const PASSPHRASE = "a long account passphrase";
const LOCAL = "the local workspace passphrase";

const accepts = vi.fn(() => Promise.resolve(true));

function options(overrides: Partial<Parameters<typeof adoptAccount>[0]> = {}) {
  return {
    email: "owner@example.com",
    baseUrl: "https://cuervo.example.com",
    passphrase: PASSPHRASE,
    enrol: accepts,
    ...overrides,
  };
}

async function seedWorkspace() {
  await createBranch({ flightId: "flight-1", name: "Thermodynamics" });
  await saveLinearDocumentPayload({
    documentId: "doc-1",
    compressionAlgorithm: "none",
    compressed: new TextEncoder().encode("the note"),
  });
}

afterEach(async () => {
  resetActiveCipher();

  const database = await getNotesDb();

  for (const store of [
    "notes-documents",
    "notes-media",
    "notes-directory",
    "branches",
    "workspace-keys",
    "workspace-rekey",
    "account",
  ] as const) {
    await database.clear(store);
  }
});

describe("adopting an account", () => {
  it("moves a workspace that was never locked onto a key of its own", async () => {
    await seedWorkspace();

    const outcome = await adoptAccount(options());

    expect(outcome.ok).toBe(true);
    expect(getActiveCipher().name).toBe("aes-gcm");

    const database = await getNotesDb();
    const stored = await database.get("notes-documents", "doc-1");

    // Sealed now, under the wing key rather than under anything derived from a passphrase.
    expect(stored?.encryption).toBe("aes-gcm");
    expect(stored?.keyId).toBe((await readAccountRecord())?.wingKeyId);
  });

  it("leaves everything readable afterwards", async () => {
    await seedWorkspace();
    await adoptAccount(options());

    const loaded = await loadNotesDocument("doc-1");

    expect(new TextDecoder().decode(loaded?.document.linearCompressed ?? new Uint8Array())).toBe(
      "the note",
    );
    expect((await listBranches())[0]?.name).toBe("Thermodynamics");
  });

  it("moves a workspace that already had a passphrase", async () => {
    await seedWorkspace();
    await createWorkspaceLock(LOCAL);
    resetActiveCipher();

    const outcome = await adoptAccount(options({ currentPassphrase: LOCAL }));

    expect(outcome.ok).toBe(true);
    expect((await listBranches())[0]?.name).toBe("Thermodynamics");
  });

  it("refuses a locked workspace when the passphrase is wrong", async () => {
    await seedWorkspace();
    await createWorkspaceLock(LOCAL);
    resetActiveCipher();

    const outcome = await adoptAccount(options({ currentPassphrase: "not the passphrase" }));

    // Nothing is rewritten and no account is written: a workspace whose rows cannot be read
    // cannot be moved, and guessing would seal ciphertext inside ciphertext.
    expect(outcome).toEqual({ ok: false, reason: "wrong-passphrase" });
    expect(await readAccountRecord()).toBeNull();
  });

  it("tells the server before it touches a row", async () => {
    await seedWorkspace();
    const order: string[] = [];
    const database = await getNotesDb();

    await adoptAccount(
      options({
        enrol: async () => {
          const stored = await database.get("notes-documents", "doc-1");

          order.push(stored?.encryption ?? "none");

          return true;
        },
      }),
    );

    // A device that seals rows under a key nothing else knows about has made them
    // unreadable everywhere but here.
    expect(order).toEqual(["none"]);
  });

  it("writes nothing when the server refuses the enrolment", async () => {
    await seedWorkspace();

    const outcome = await adoptAccount(options({ enrol: () => Promise.resolve(false) }));
    const database = await getNotesDb();

    expect(outcome).toEqual({ ok: false, reason: "enrolment-refused" });
    expect((await database.get("notes-documents", "doc-1"))?.encryption ?? "none").toBe("none");
    expect(await readAccountRecord()).toBeNull();
  });

  it("will not adopt twice over the top of an account that exists", async () => {
    await seedWorkspace();
    await adoptAccount(options());

    const second = await adoptAccount(options({ email: "someone.else@example.com" }));

    expect(second).toEqual({ ok: false, reason: "already-adopted" });
  });

  it("hands the server a proof and never the passphrase", async () => {
    await seedWorkspace();
    const seen: { authKey: string; material: { sealedAccountKey: string } }[] = [];

    await adoptAccount(
      options({
        enrol: (request) => {
          seen.push(request);

          return Promise.resolve(true);
        },
      }),
    );

    expect(seen[0].authKey).not.toContain(PASSPHRASE);
    expect(seen[0].material.sealedAccountKey).not.toContain(PASSPHRASE);
    expect(JSON.stringify(seen[0])).not.toContain(PASSPHRASE);
  });
});

describe("unlocking an adopted account", () => {
  it("opens the workspace from the passphrase alone, with no server", async () => {
    await seedWorkspace();
    await adoptAccount(options());

    // A cold load: nothing in memory, only what is on disk.
    resetActiveCipher();
    expect((await unlockAccount(PASSPHRASE)).ok).toBe(true);
    expect((await listBranches())[0]?.name).toBe("Thermodynamics");
  });

  it("refuses the wrong passphrase", async () => {
    await seedWorkspace();
    await adoptAccount(options());
    resetActiveCipher();

    expect(await unlockAccount("not the passphrase")).toEqual({
      ok: false,
      reason: "wrong-passphrase",
    });
    expect(getActiveCipher().name).toBe("none");
  });

  it("says so when this device has no account", async () => {
    expect(await unlockAccount(PASSPHRASE)).toEqual({ ok: false, reason: "no-account" });
  });

  it("refuses a record whose wing key will not open", async () => {
    await seedWorkspace();
    await adoptAccount(options());

    const database = await getNotesDb();
    const record = await readAccountRecord();

    // The right passphrase, opening the right account key, onto bytes that are not the
    // wing key. Nothing is guessed and nothing half-opens.
    await database.put("account", { ...record!, wrappedWingKey: "bm90IGEgd3JhcA" });
    resetActiveCipher();

    expect(await unlockAccount(PASSPHRASE)).toEqual({ ok: false, reason: "wrong-passphrase" });
  });
});

describe("signing out", () => {
  it("forgets the account and leaves the notes sealed", async () => {
    await seedWorkspace();
    await adoptAccount(options());
    await forgetAccount();
    resetActiveCipher();

    const database = await getNotesDb();

    expect(await readAccountRecord()).toBeNull();
    // The bytes are still there and still unreadable: a door locked, not a note destroyed.
    expect((await database.get("notes-documents", "doc-1"))?.encryption).toBe("aes-gcm");
    expect(await unlockAccount(PASSPHRASE)).toEqual({ ok: false, reason: "no-account" });
  });
});
