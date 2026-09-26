// @vitest-environment node
//
// Node, not jsdom: adoption rewrites stored media, and fake-indexeddb flattens a jsdom Blob
// into a bare object with no arrayBuffer(). Node's Blob survives.
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/server";

import { getActiveCipher, resetActiveCipher } from "../cipher";
import { createBranch, createFlight, createWing, listBranches } from "../entity-storage";
import { createObjectKey, wrapForRecipient } from "../keys/key-graph";
import { cipherForObject } from "../keys/object-keys";
import { refreshKeyGraph } from "../keys/refresh-graph";
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

const BASE = "https://cuervo.example.com";
const PASSPHRASE = "a long account passphrase";
const LOCAL = "the local workspace passphrase";

const accepts = vi.fn(() => Promise.resolve(true));

function options(overrides: Partial<Parameters<typeof adoptAccount>[0]> = {}) {
  return {
    email: "owner@example.com",
    baseUrl: BASE,
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
    "flights",
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

describe("keys minted after adoption", () => {
  it("are kept in the record, so a cold load still opens them", async () => {
    await seedWorkspace();
    await adoptAccount(options());

    const before = (await readAccountRecord())?.graph.keys.length ?? 0;

    // Anything made from now on gets a key of its own, hung under the wing.
    const flight = await createFlight({ wingId: "wing-1", name: "Fall 2026" });
    await createBranch({ flightId: flight.id, name: "Optics" });

    const after = await readAccountRecord();

    expect(after?.graph.keys.length).toBeGreaterThan(before);

    // And it really opens on a cold load, from the cached graph alone.
    resetActiveCipher();
    expect((await unlockAccount(PASSPHRASE)).ok).toBe(true);
    expect((await listBranches()).map((branch) => branch.name)).toContain("Optics");
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

describe("a course somebody shared with you", () => {
  /** Puts a grant for a key of somebody else's into the cached graph, as a sync would. */
  async function cacheSharedKey() {
    const record = await readAccountRecord();
    const shared = await createObjectKey("branch");
    const database = await getNotesDb();

    await database.put("account", {
      ...record!,
      graph: {
        keys: [...record!.graph.keys, { id: shared.keyId, kind: "branch", rotatedFrom: null }],
        wraps: record!.graph.wraps,
        grants: [
          ...record!.graph.grants,
          {
            keyId: shared.keyId,
            role: "writer",
            wrapped: await wrapForRecipient(shared.key, record!.material.publicKey),
          },
        ],
      },
    });

    return shared.keyId;
  }

  it("opens with no network at all, from the grant on disk", async () => {
    await seedWorkspace();
    await adoptAccount(options());
    const sharedKeyId = await cacheSharedKey();

    // A cold load on a plane. The key hangs under nothing of ours, so only the grant
    // reaches it — and a wrap-only walk from the wing would never find it.
    resetActiveCipher();
    expect((await unlockAccount(PASSPHRASE)).ok).toBe(true);
    expect(cipherForObject(sharedKeyId).keyId).toBe(sharedKeyId);
  });

  it("is written back under its own key, not under yours", async () => {
    await seedWorkspace();
    await adoptAccount(options());
    const sharedKeyId = await cacheSharedKey();

    resetActiveCipher();
    await unlockAccount(PASSPHRASE);

    // Falling back to the workspace's own key here would re-seal somebody else's note
    // under a key they do not have, and lock them out of their own course.
    expect(cipherForObject(sharedKeyId)).not.toBe(getActiveCipher());
  });

  it("survives the next thing you create, having arrived mid-session", async () => {
    await seedWorkspace();
    await adoptAccount(options());

    const record = await readAccountRecord();
    const shared = await createObjectKey("branch");

    // The way a share really arrives: a sync round fetches it, not the record being
    // written by hand before the workspace was ever opened.
    server.use(
      http.get(`${BASE}/v1/keys/graph`, async () =>
        HttpResponse.json({
          keys: [{ id: shared.keyId, kind: "branch", rotatedFrom: null }],
          wraps: [],
          grants: [
            {
              keyId: shared.keyId,
              role: "writer",
              wrapped: await wrapForRecipient(shared.key, record!.material.publicKey),
            },
          ],
        }),
      ),
    );

    expect(await refreshKeyGraph({ baseUrl: BASE, token: "a-token" })).toBe(1);

    // Anything minted afterwards writes the module's own graph back over the record. If
    // that write is not a merge, the grant fetched this session is gone and the course is
    // dark on the next offline launch.
    const wing = await createWing("My wing");

    await createFlight({ wingId: wing.id, name: "Spring 2027" });

    resetActiveCipher();
    await unlockAccount(PASSPHRASE);

    expect(cipherForObject(shared.keyId).keyId).toBe(shared.keyId);
  });

  it("leaves your own courses listable when the share has ended", async () => {
    await seedWorkspace();
    await adoptAccount(options());

    const database = await getNotesDb();
    const mine = (await database.getAll("branches"))[0];

    // A row left behind by a share that is over: sealed under a key that is gone.
    await database.put("branches", { ...mine, id: "theirs", keyId: "a-key-nobody-gave-me" });

    expect((await listBranches()).map((branch) => branch.name)).toEqual(["Thermodynamics"]);
  });
});
