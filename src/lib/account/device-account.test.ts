import { beforeEach, describe, expect, it, vi } from "vitest";

import { setApiSession } from "../api/session-store";
import { getActiveCipher, resetActiveCipher } from "../crypto/cipher";
import { eraseNotesDb, getNotesDb } from "../db/notes-db";
import { ensureDefaultWorkspace } from "../hierarchy/workspace-storage";
import { forgetKeyring } from "../keys/object-keys";
import { lockWorkspace, readLockHint, readLockRecord } from "../lock/workspace-lock";
import { createWorkspaceLock } from "../lock/workspace-passphrase";
import {
  createNotesDirectoryEntry,
  listNotesDirectoryEntries,
} from "../notes/notes-directory-storage";
import { resetSyncState } from "../sync/sync-service";
import {
  changeDevicePassphrase,
  createLocalAccount,
  eraseDevice,
  resumeRememberedDevice,
  unlockDevice,
  verifyDevicePassphrase,
} from "./device-account";
import { readLocalAccount } from "./local-account";

// Argon2id at its real cost is a second a call; these tests derive dozens of times.
vi.mock("../crypto/kdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../crypto/kdf")>()),
  createKdfParams: () => ({
    name: "Argon2id" as const,
    memorySize: 1024,
    iterations: 1,
    parallelism: 1,
    salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
  }),
  // Cheap parameters are below the floor a server's are held to; that floor has its own tests.
  assertAccountKdf: () => undefined,
}));

const PROFILE = { name: "Ada", email: "ada@example.com" };
const PASSPHRASE = "correct horse battery";

beforeEach(async () => {
  resetActiveCipher();
  forgetKeyring();
  setApiSession(null);
  resetSyncState();
  await eraseNotesDb();
});

async function writeNote(title: string) {
  const { path } = await ensureDefaultWorkspace();

  return createNotesDirectoryEntry({ branchId: path.branch.id, feather: title });
}

describe("createLocalAccount", () => {
  it("locks a new device with the passphrase and encrypts what is already there", async () => {
    const note = await writeNote("Mitosis");

    expect(await createLocalAccount({ ...PROFILE, passphrase: PASSPHRASE })).toEqual({ ok: true });

    expect(await readLocalAccount()).toMatchObject(PROFILE);
    expect(await readLockRecord()).toBeDefined();
    expect(readLockHint()).toBe(true);
    expect(getActiveCipher().name).toBe("aes-gcm");

    const stored = await (await getNotesDb()).get("notes-directory", note.id);
    expect(stored?.feather).not.toBe("Mitosis");
    expect((await listNotesDirectoryEntries())[0].feather).toBe("Mitosis");
  });

  it("refuses a second local account on the same device", async () => {
    await createLocalAccount({ ...PROFILE, passphrase: PASSPHRASE });

    expect(await createLocalAccount({ ...PROFILE, passphrase: PASSPHRASE })).toEqual({
      ok: false,
      reason: "exists",
    });
  });

  it("keeps the passphrase an older, already-locked device has, and checks it", async () => {
    await createWorkspaceLock(PASSPHRASE);
    const before = await readLockRecord();
    await lockWorkspace();

    expect(await createLocalAccount({ ...PROFILE, passphrase: "something else" })).toEqual({
      ok: false,
      reason: "wrong-passphrase",
    });
    expect(await readLocalAccount()).toBeNull();

    expect(await createLocalAccount({ ...PROFILE, passphrase: PASSPHRASE })).toEqual({ ok: true });
    // Same lock: nothing was re-encrypted, the device just gained a name.
    expect((await readLockRecord())?.keyId).toBe(before?.keyId);
  });
});

describe("unlocking and checking the passphrase", () => {
  it("opens a locked local device with its passphrase and nothing else", async () => {
    await writeNote("Photosynthesis");
    await createLocalAccount({ ...PROFILE, passphrase: PASSPHRASE });
    await lockWorkspace();

    expect(await unlockDevice("wrong")).toBe(false);
    expect(await unlockDevice(PASSPHRASE)).toBe(true);
    expect((await listNotesDirectoryEntries())[0].feather).toBe("Photosynthesis");
  });

  it("checks a passphrase without unlocking anything", async () => {
    await createLocalAccount({ ...PROFILE, passphrase: PASSPHRASE });
    await lockWorkspace();

    expect(await verifyDevicePassphrase(PASSPHRASE)).toBe(true);
    expect(await verifyDevicePassphrase("wrong")).toBe(false);
    expect(getActiveCipher().name).toBe("none");
  });
});

describe("keep me signed in, on a local-only device", () => {
  it("reopens the device after a reload when asked to, and only then", async () => {
    await writeNote("Photosynthesis");
    await createLocalAccount({ ...PROFILE, passphrase: PASSPHRASE });
    resetActiveCipher();

    expect(await unlockDevice(PASSPHRASE)).toBe(true);
    resetActiveCipher();
    expect(await resumeRememberedDevice()).toBe(false);

    expect(await unlockDevice(PASSPHRASE, { remember: true })).toBe(true);
    // A reload drops the key from memory; the remembered one brings it back.
    resetActiveCipher();
    expect(await resumeRememberedDevice()).toBe(true);
    expect((await listNotesDirectoryEntries())[0].feather).toBe("Photosynthesis");
  });

  it("is forgotten by locking, and by an unlock that does not ask to be remembered", async () => {
    await createLocalAccount({ ...PROFILE, passphrase: PASSPHRASE });

    await unlockDevice(PASSPHRASE, { remember: true });
    await lockWorkspace();
    expect(await resumeRememberedDevice()).toBe(false);

    await unlockDevice(PASSPHRASE, { remember: true });
    await unlockDevice(PASSPHRASE);
    resetActiveCipher();
    expect(await resumeRememberedDevice()).toBe(false);
  });

  it("is forgotten by a new passphrase, which the old key no longer opens", async () => {
    await createLocalAccount({ ...PROFILE, passphrase: PASSPHRASE });
    await unlockDevice(PASSPHRASE, { remember: true });

    expect(await changeDevicePassphrase(PASSPHRASE, "next one")).toEqual({ ok: true });
    resetActiveCipher();

    expect(await resumeRememberedDevice()).toBe(false);
    expect(await (await getNotesDb()).count("remembered-unlock")).toBe(0);
  });

  it("refuses a remembered key that is no longer the lock's, and forgets it", async () => {
    await createLocalAccount({ ...PROFILE, passphrase: PASSPHRASE });
    await unlockDevice(PASSPHRASE, { remember: true });
    const database = await getNotesDb();
    const lock = await readLockRecord();

    if (!lock) {
      throw new Error("expected a lock");
    }

    // As if another tab changed the passphrase without this one hearing of it.
    await database.put("workspace-keys", { ...lock, keyId: "someone-else" });
    resetActiveCipher();

    expect(await resumeRememberedDevice()).toBe(false);
    expect(await database.count("remembered-unlock")).toBe(0);
  });
});

describe("changeDevicePassphrase on a local-only device", () => {
  it("moves every note to the new passphrase", async () => {
    await writeNote("Osmosis");
    await createLocalAccount({ ...PROFILE, passphrase: PASSPHRASE });

    expect(await changeDevicePassphrase("wrong", "next one")).toEqual({
      ok: false,
      reason: "wrong-passphrase",
    });
    expect(await changeDevicePassphrase(PASSPHRASE, "next one")).toEqual({ ok: true });

    await lockWorkspace();
    expect(await unlockDevice(PASSPHRASE)).toBe(false);
    expect(await unlockDevice("next one")).toBe(true);
    expect((await listNotesDirectoryEntries())[0].feather).toBe("Osmosis");
  });

  it("reports a rewrite that fails rather than throwing", async () => {
    await createLocalAccount({ ...PROFILE, passphrase: PASSPHRASE });
    // A journal left behind by an interrupted change: a second change must refuse.
    await (
      await getNotesDb()
    ).put("workspace-rekey", {
      id: "rekey",
      source: null,
      target: null,
      store: "notes-documents",
      lastKey: null,
      done: 0,
      total: 0,
      startedAt: 1,
    });

    expect(await changeDevicePassphrase(PASSPHRASE, "next one")).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

describe("eraseDevice", () => {
  it("forgets every note, the local account and every setting", async () => {
    await writeNote("Secret");
    await createLocalAccount({ ...PROFILE, passphrase: PASSPHRASE });
    window.localStorage.setItem("cuervo-preferences", "{}");

    await eraseDevice();

    expect(await readLocalAccount()).toBeNull();
    expect(await readLockRecord()).toBeUndefined();
    expect(await (await getNotesDb()).getAll("notes-directory")).toEqual([]);
    expect(window.localStorage.length).toBe(0);
    expect(getActiveCipher().name).toBe("none");
  });
});
