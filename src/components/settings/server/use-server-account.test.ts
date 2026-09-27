import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readAccountRecord } from "@/lib/account/account-record";
import { createLocalAccount } from "@/lib/account/device-account";
import { writeServerUrl } from "@/lib/api/server-url";
import { getApiSession, setApiSession } from "@/lib/api/session-store";
import { resetActiveCipher } from "@/lib/crypto/cipher";
import { eraseNotesDb } from "@/lib/db/notes-db";
import { ensureDefaultWorkspace } from "@/lib/hierarchy/workspace-storage";
import { forgetKeyring } from "@/lib/keys/object-keys";
import { createNotesDirectoryEntry } from "@/lib/notes/notes-directory-storage";
import { resetSyncState } from "@/lib/sync/sync-service";
import { startFakeSyncServer } from "@/test/fake-sync-server";

import { useServerAccount } from "./use-server-account";

/** Success is reported as a toast; what is said is what is checked. */
const toast = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  notifyInfo: vi.fn(),
}));

vi.mock("@/lib/toast", () => toast);

// Argon2id at its real cost is a second a call, and these flows derive many times.
vi.mock("@/lib/crypto/kdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crypto/kdf")>()),
  createKdfParams: () => ({
    name: "Argon2id" as const,
    memorySize: 1024,
    iterations: 1,
    parallelism: 1,
    salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
  }),
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
  toast.notifySuccess.mockClear();
});

/** A device with its local account and a note, pointed at the fake server. */
async function localDevice() {
  await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: PASSPHRASE });
  const { path } = await ensureDefaultWorkspace();
  await createNotesDirectoryEntry({ branchId: path.branch.id, feather: "Mitosis" });
  writeServerUrl(fake.baseUrl);
}

async function mount() {
  const hook = renderHook(() => useServerAccount());
  await waitFor(() => expect(hook.result.current.status).not.toBe("loading"));
  return hook;
}

describe("choosing a server", () => {
  it("starts with no server in a build that names none, and takes a chosen one", async () => {
    const { result } = await mount();

    expect(result.current.status).toBe("disconnected");
    expect(result.current.serverUrl).toBeNull();
    expect(result.current.sessionFor()).toBeNull();

    act(() => {
      expect(result.current.changeServer("not a url")).toBe(false);
    });
    expect(result.current.error).toMatch(/not a web address/);

    act(() => {
      expect(result.current.changeServer("https://mine.example.org/")).toBe(true);
    });
    expect(result.current.serverUrl).toBe("https://mine.example.org");
    expect(result.current.error).toBeNull();
    expect(result.current.sessionFor()).toEqual({ baseUrl: "https://mine.example.org" });

    act(() => {
      result.current.changeServer(null);
    });
    expect(result.current.serverUrl).toBeNull();

    act(() => {
      result.current.resetServer();
    });
    expect(result.current.serverUrl).toBe(result.current.defaultServerUrl);
  });

  it("asks for a server before creating or signing in to an account", async () => {
    await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: PASSPHRASE });
    const { result } = await mount();

    await act(async () => {
      expect(await result.current.createAccount(EMAIL, PASSPHRASE)).toBe(false);
    });
    expect(result.current.error).toBe("Choose a server first.");

    await act(async () => {
      expect(await result.current.signIn(EMAIL, PASSPHRASE, "merge")).toBe(false);
    });
    expect(result.current.error).toBe("Choose a server first.");
  });
});

describe("a server account", () => {
  it("is created with the device's passphrase, syncs, and holds the server in place", async () => {
    await localDevice();
    const { result } = await mount();

    expect(result.current.hasContent).toBe(true);

    await act(async () => {
      expect(await result.current.createAccount(EMAIL, "wrong")).toBe(false);
    });
    expect(result.current.error).toMatch(/not this device's passphrase/);

    await act(async () => {
      expect(await result.current.createAccount(EMAIL, PASSPHRASE)).toBe(true);
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.record?.email).toBe(EMAIL);

    // A reload before the background session opens: the account, and no session yet.
    setApiSession(null);
    await act(async () => {
      expect(await result.current.sync()).toBe(false);
    });
    expect(result.current.error).toMatch(/Not connected/);

    // What the next unlock does in the background.
    setApiSession({ baseUrl: fake.baseUrl, token: "stale" });
    await act(async () => {
      expect(await result.current.sync()).toBe(false);
    });
    expect(result.current.error).toMatch(/Could not reach/);

    const { result: again } = await mount();
    act(() => {
      expect(again.current.changeServer("https://other.example.org")).toBe(false);
    });
    expect(again.current.error).toMatch(/Disconnect/);
    act(() => {
      expect(again.current.resetServer()).toBe(false);
    });
  });

  it("syncs through the session the enrolment opened", async () => {
    await localDevice();
    const { result } = await mount();

    await act(async () => {
      await result.current.createAccount(EMAIL, PASSPHRASE);
    });
    expect(getApiSession()?.token).toBeTruthy();

    await act(async () => {
      expect(await result.current.sync()).toBe(true);
    });
    expect(result.current.lastSync?.pushed).toBeGreaterThan(0);
    expect(toast.notifySuccess).toHaveBeenCalledWith("Synced", expect.any(String));
    expect(fake.rowCount(EMAIL, "notes-directory")).toBe(1);
  });

  it("signs a second device in, disconnects it, and deletes the account", async () => {
    await localDevice();
    const first = await mount();
    await act(async () => {
      await first.result.current.createAccount(EMAIL, PASSPHRASE);
      await first.result.current.sync();
    });
    first.unmount();

    await freshDevice();
    writeServerUrl(fake.baseUrl);
    const { result } = await mount();

    await act(async () => {
      expect(await result.current.signIn(EMAIL, "wrong", "replace")).toBe(false);
    });
    expect(result.current.error).toMatch(/do not open an account/);

    await act(async () => {
      expect(await result.current.signIn(EMAIL, PASSPHRASE, "replace")).toBe(true);
    });
    expect(result.current.isConnected).toBe(true);
    expect(toast.notifySuccess).toHaveBeenCalledWith("Signed in", expect.stringContaining(EMAIL));

    await act(async () => {
      expect(await result.current.disconnect("wrong")).toBe(false);
    });
    expect(result.current.error).toMatch(/not this device's passphrase/);

    await act(async () => {
      expect(await result.current.disconnect(PASSPHRASE)).toBe(true);
    });
    expect(result.current.status).toBe("disconnected");
    expect(await readAccountRecord()).toBeNull();

    await act(async () => {
      expect(await result.current.deleteServerAccount(PASSPHRASE)).toBe(false);
    });
    expect(result.current.error).toMatch(/not on a server account/);

    await act(async () => {
      await result.current.signIn(EMAIL, PASSPHRASE, "merge");
    });
    await act(async () => {
      expect(await result.current.deleteServerAccount(PASSPHRASE)).toBe(true);
    });
    expect(toast.notifySuccess).toHaveBeenCalledWith("Server account deleted", expect.any(String));
    expect(fake.account(EMAIL)).toBeUndefined();
    expect(result.current.status).toBe("disconnected");
  });
});
