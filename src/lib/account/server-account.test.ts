import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { startFakeSyncServer } from "@/test/fake-sync-server";
import { server } from "@/test/server";

import { getApiSession, setApiSession } from "../api/session-store";
import { resetActiveCipher } from "../crypto/cipher";
import { eraseNotesDb } from "../db/notes-db";
import { ensureDefaultWorkspace } from "../hierarchy/workspace-storage";
import { forgetKeyring } from "../keys/object-keys";
import { lockWorkspace } from "../lock/workspace-lock";
import {
  createNotesDirectoryEntry,
  listNotesDirectoryEntries,
} from "../notes/notes-directory-storage";
import { resetSyncState, runSyncRound } from "../sync/sync-service";
import { readAccountRecord } from "./account-record";
import {
  changeDevicePassphrase,
  createLocalAccount,
  unlockDevice,
  verifyDevicePassphrase,
} from "./device-account";
import { enrolServerAccount, signInToServer } from "./server-connect";
import {
  deleteServerAccountAndDisconnect,
  disconnectServer,
  openAccountSession,
} from "./server-disconnect";

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

const EMAIL = "ada@example.com";
const PASSPHRASE = "correct horse battery";

let fake: ReturnType<typeof startFakeSyncServer>;

async function freshDevice() {
  resetActiveCipher();
  forgetKeyring();
  setApiSession(null);
  resetSyncState();
  await eraseNotesDb();
}

beforeEach(async () => {
  await freshDevice();
  fake = startFakeSyncServer();
});

async function writeNote(title: string) {
  const { path } = await ensureDefaultWorkspace();

  return createNotesDirectoryEntry({ branchId: path.branch.id, feather: title });
}

const titles = async () => (await listNotesDirectoryEntries()).map((entry) => entry.feather).sort();

/** A device with a local account, a note, and a server account holding a copy of it. */
async function enrolledDevice(title = "Mitosis") {
  await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: PASSPHRASE });
  await writeNote(title);

  expect(
    await enrolServerAccount({ email: EMAIL, passphrase: PASSPHRASE, baseUrl: fake.baseUrl }),
  ).toEqual({ ok: true });
  await runSyncRound();
}

describe("enrolServerAccount", () => {
  it("creates the account with the device's passphrase and sends the notes up sealed", async () => {
    await enrolledDevice();

    expect(await readAccountRecord()).toMatchObject({ email: EMAIL, baseUrl: fake.baseUrl });
    expect(fake.rowCount(EMAIL, "notes-directory")).toBe(1);
    expect(JSON.stringify([...fake.account(EMAIL)!.rows.values()])).not.toContain("Mitosis");
  });

  it("reopens after a reload with the same passphrase, through the account's keys", async () => {
    await enrolledDevice();
    // What a reload leaves: no key in memory, the record and rows on disk.
    resetActiveCipher();
    forgetKeyring();
    setApiSession(null);

    expect(await unlockDevice("wrong")).toBe(false);
    expect(await unlockDevice(PASSPHRASE)).toBe(true);
    expect(await titles()).toEqual(["Mitosis"]);
    await vi.waitFor(() => expect(getApiSession()?.token).toBeTruthy());
  });

  it("says when the address is taken, and changes nothing", async () => {
    await enrolledDevice();
    await freshDevice();
    await createLocalAccount({ name: "Other", email: EMAIL, passphrase: "another one" });

    expect(
      await enrolServerAccount({ email: EMAIL, passphrase: "another one", baseUrl: fake.baseUrl }),
    ).toEqual({ ok: false, reason: "email-taken" });
    expect(await readAccountRecord()).toBeNull();
  });

  it("refuses a passphrase that is not the device's, and a second account", async () => {
    await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: PASSPHRASE });

    expect(
      await enrolServerAccount({ email: EMAIL, passphrase: "wrong", baseUrl: fake.baseUrl }),
    ).toEqual({ ok: false, reason: "wrong-passphrase" });

    await enrolServerAccount({ email: EMAIL, passphrase: PASSPHRASE, baseUrl: fake.baseUrl });
    expect(
      await enrolServerAccount({ email: EMAIL, passphrase: PASSPHRASE, baseUrl: fake.baseUrl }),
    ).toEqual({ ok: false, reason: "already-connected" });
  });

  it("says when the server does not take accounts for this address", async () => {
    await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: PASSPHRASE });
    server.use(
      http.post(`${fake.baseUrl}/v1/auth/register`, () =>
        HttpResponse.json({ error: "registration_closed", message: "closed" }, { status: 403 }),
      ),
    );

    expect(
      await enrolServerAccount({ email: EMAIL, passphrase: PASSPHRASE, baseUrl: fake.baseUrl }),
    ).toEqual({ ok: false, reason: "registration-closed" });
  });

  it("reports a server that is not there", async () => {
    await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: PASSPHRASE });

    expect(
      await enrolServerAccount({
        email: EMAIL,
        passphrase: PASSPHRASE,
        baseUrl: "https://nowhere.example.test",
      }),
    ).toEqual({ ok: false, reason: "unreachable" });
  });
});

describe("signInToServer on a second device", () => {
  it("replaces an empty device's workspace with the account's", async () => {
    await enrolledDevice("Mitosis");
    await freshDevice();

    expect(
      await signInToServer({
        email: EMAIL,
        passphrase: PASSPHRASE,
        baseUrl: fake.baseUrl,
        mode: "replace",
      }),
    ).toEqual({ ok: true });

    expect(await titles()).toEqual(["Mitosis"]);
    // The account's passphrase now opens this device too.
    lockWorkspace();
    forgetKeyring();
    setApiSession(null);
    expect(await unlockDevice(PASSPHRASE)).toBe(true);
    expect(await titles()).toEqual(["Mitosis"]);
    // Let the session the unlock opens in the background finish before the next test.
    await vi.waitFor(() => expect(getApiSession()?.token).toBeTruthy());
  });

  it("merges a device's own notes into the account, and moves its lock to the account's passphrase", async () => {
    await enrolledDevice("Mitosis");
    await freshDevice();
    await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: "the laptop's own" });
    await writeNote("Meiosis");

    expect(
      await signInToServer({
        email: EMAIL,
        passphrase: PASSPHRASE,
        baseUrl: fake.baseUrl,
        mode: "merge",
      }),
    ).toEqual({ ok: true });

    expect(await titles()).toEqual(["Meiosis", "Mitosis"]);
    expect(fake.rowCount(EMAIL, "notes-directory")).toBe(2);
    expect(await verifyDevicePassphrase(PASSPHRASE)).toBe(true);
    expect(await verifyDevicePassphrase("the laptop's own")).toBe(false);
  });

  it("drops this device's notes when told to replace them", async () => {
    await enrolledDevice("Mitosis");
    await freshDevice();
    await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: PASSPHRASE });
    await writeNote("Throwaway");

    await signInToServer({
      email: EMAIL,
      passphrase: PASSPHRASE,
      baseUrl: fake.baseUrl,
      mode: "replace",
    });

    expect(await titles()).toEqual(["Mitosis"]);
  });

  it("refuses the wrong passphrase, a locked device and a second account", async () => {
    await enrolledDevice();
    await freshDevice();

    const attempt = (passphrase: string) =>
      signInToServer({ email: EMAIL, passphrase, baseUrl: fake.baseUrl, mode: "merge" });

    expect(await attempt("wrong")).toEqual({ ok: false, reason: "wrong-credentials" });

    await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: "local" });
    lockWorkspace();
    expect(await attempt(PASSPHRASE)).toEqual({ ok: false, reason: "locked" });

    await unlockDevice("local");
    expect(await attempt(PASSPHRASE)).toEqual({ ok: true });
    expect(await attempt(PASSPHRASE)).toEqual({ ok: false, reason: "already-connected" });
  });

  it("reports a server that cannot be reached", async () => {
    expect(
      await signInToServer({
        email: EMAIL,
        passphrase: PASSPHRASE,
        baseUrl: "https://nowhere.example.test",
        mode: "merge",
      }),
    ).toEqual({ ok: false, reason: "unreachable" });
  });
});

describe("disconnecting and deleting", () => {
  it("keeps every note on the device, opened by the local passphrase alone", async () => {
    await enrolledDevice();

    expect(await disconnectServer("wrong")).toEqual({ ok: false, reason: "wrong-passphrase" });
    expect(await disconnectServer(PASSPHRASE)).toEqual({ ok: true });

    expect(await readAccountRecord()).toBeNull();
    expect(getApiSession()).toBeNull();
    // The server account is still there to sign back in to.
    expect(fake.account(EMAIL)).toBeDefined();

    resetActiveCipher();
    forgetKeyring();
    expect(await unlockDevice(PASSPHRASE)).toBe(true);
    expect(await titles()).toEqual(["Mitosis"]);
    expect(await disconnectServer(PASSPHRASE)).toEqual({ ok: false, reason: "not-connected" });
  });

  it("erases the server account and keeps the notes here", async () => {
    await enrolledDevice();

    expect(await deleteServerAccountAndDisconnect("wrong")).toEqual({
      ok: false,
      reason: "wrong-passphrase",
    });
    expect(await deleteServerAccountAndDisconnect(PASSPHRASE)).toEqual({ ok: true });

    expect(fake.account(EMAIL)).toBeUndefined();
    expect(await readAccountRecord()).toBeNull();
    expect(await titles()).toEqual(["Mitosis"]);
  });

  it("opens a session for the delete when none is open", async () => {
    await enrolledDevice();
    setApiSession(null);

    expect(await deleteServerAccountAndDisconnect(PASSPHRASE)).toEqual({ ok: true });
    expect(fake.account(EMAIL)).toBeUndefined();
  });

  it("says so when there is nothing to delete", async () => {
    expect(await deleteServerAccountAndDisconnect(PASSPHRASE)).toEqual({
      ok: false,
      reason: "not-connected",
    });
  });

  it("leaves the account in place when the server refuses the delete", async () => {
    await enrolledDevice();
    setApiSession({ baseUrl: "https://nowhere.example.test", token: "stale" });

    expect(await deleteServerAccountAndDisconnect(PASSPHRASE)).toEqual({
      ok: false,
      reason: "unreachable",
    });
    expect(await readAccountRecord()).not.toBeNull();
  });
});

describe("the account passphrase and its session", () => {
  it("changes the passphrase on the server and on this device, with no note rewritten", async () => {
    await enrolledDevice();

    expect(await changeDevicePassphrase("wrong", "a new one")).toEqual({
      ok: false,
      reason: "wrong-passphrase",
    });
    expect(await changeDevicePassphrase(PASSPHRASE, "a new one")).toEqual({ ok: true });

    resetActiveCipher();
    forgetKeyring();
    setApiSession(null);
    expect(await unlockDevice(PASSPHRASE)).toBe(false);
    expect(await unlockDevice("a new one")).toBe(true);
    expect(await titles()).toEqual(["Mitosis"]);
    await vi.waitFor(() => expect(getApiSession()?.token).toBeTruthy());

    // A second device signs in with the new one.
    await freshDevice();
    expect(
      await signInToServer({
        email: EMAIL,
        passphrase: "a new one",
        baseUrl: fake.baseUrl,
        mode: "replace",
      }),
    ).toEqual({ ok: true });
  });

  it("needs the server to change an account's passphrase", async () => {
    await enrolledDevice();
    setApiSession({ baseUrl: "https://nowhere.example.test", token: "stale" });

    expect(await changeDevicePassphrase(PASSPHRASE, "a new one")).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  it("opens a session after an unlock, or says it could not", async () => {
    expect(await openAccountSession(PASSPHRASE)).toBe(false);

    await enrolledDevice();
    setApiSession(null);
    expect(await openAccountSession("wrong")).toBe(false);
    expect(await openAccountSession(PASSPHRASE)).toBe(true);
    expect(getApiSession()?.token).toBeTruthy();
  });
});
