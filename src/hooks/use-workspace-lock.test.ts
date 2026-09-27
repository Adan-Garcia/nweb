import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetActiveCipher } from "@/lib/crypto/cipher";
import { getNotesDb } from "@/lib/db/notes-db";
import { REKEY_JOURNAL_ID, writeRekeyJournal } from "@/lib/lock/rekey-journal";
import { lockWorkspace } from "@/lib/lock/workspace-lock";
import { createWorkspaceLock } from "@/lib/lock/workspace-passphrase";

import { useWorkspaceLock } from "./use-workspace-lock";

const PASSPHRASE = "correct horse battery";

/** Flipped by the one test that needs the resume to fail the way a bad row would. */
const failures = vi.hoisted(() => ({ resume: false }));

vi.mock("@/lib/lock/workspace-passphrase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lock/workspace-passphrase")>();

  return {
    ...actual,
    resumeRekey: (...args: Parameters<typeof actual.resumeRekey>) => {
      if (failures.resume) {
        throw new Error("the sweep could not finish");
      }

      return actual.resumeRekey(...args);
    },
  };
});

// The shipped Argon2id cost — 64 MiB, three passes — would make each of these take a
// second. The parameters travel in the lock record, so unlocking uses the cheap ones too.
vi.mock("@/lib/crypto/kdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crypto/kdf")>()),
  createKdfParams: () => ({
    name: "Argon2id",
    memorySize: 1024,
    iterations: 1,
    parallelism: 1,
    salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
  }),
}));

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("workspace-keys"),
    database.clear("workspace-rekey"),
    database.clear("notes-documents"),
  ]);
  window.localStorage.clear();
  resetActiveCipher();
  failures.resume = false;
});

async function mount() {
  const hook = renderHook(() => useWorkspaceLock());
  await waitFor(() => expect(hook.result.current.state).not.toBeNull());
  return hook;
}

/** A device with its passphrase set, as setting up the local account leaves it. */
async function mountLocked() {
  await createWorkspaceLock(PASSPHRASE);
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.state).toBe("unlocked"));
  return hook;
}

describe("useWorkspaceLock", () => {
  it("starts unset when no passphrase has been chosen", async () => {
    const { result } = await mount();

    expect(result.current.state).toBe("unset");
    expect(result.current.error).toBeNull();
  });

  it("locks, then unlocks with the right passphrase", async () => {
    const { result } = await mountLocked();

    await act(async () => {
      await result.current.lock();
    });
    expect(result.current.state).toBe("locked");

    await act(async () => {
      expect(await result.current.unlock(PASSPHRASE)).toBe(true);
    });
    expect(result.current.state).toBe("unlocked");
    expect(result.current.error).toBeNull();
  });

  it("stays locked and explains itself for the wrong passphrase", async () => {
    const { result } = await mountLocked();
    await act(async () => {
      await result.current.lock();
    });

    await act(async () => {
      expect(await result.current.unlock("wrong")).toBe(false);
    });

    expect(result.current.state).toBe("locked");
    expect(result.current.error).toMatch(/does not unlock/);
  });

  it("changes the passphrase, and reports a wrong current one", async () => {
    const { result } = await mountLocked();

    await act(async () => {
      expect(await result.current.change("wrong", "second passphrase")).toBe(false);
    });
    expect(result.current.error).toMatch(/not the one this device is locked with/);

    await act(async () => {
      expect(await result.current.change(PASSPHRASE, "second passphrase")).toBe(true);
    });
    expect(result.current.state).toBe("unlocked");
    expect(result.current.error).toBeNull();

    await act(async () => {
      await result.current.lock();
      expect(await result.current.unlock("second passphrase")).toBe(true);
    });
    expect(result.current.state).toBe("unlocked");
  });

  it("says the old passphrase still works when a change fails outright", async () => {
    const { result } = await mountLocked();

    // An empty new passphrase is one Argon2id refuses, so the derivation throws rather
    // than returning a wrong-passphrase answer.
    await act(async () => {
      expect(await result.current.change(PASSPHRASE, "")).toBe(false);
    });

    expect(result.current.error).toMatch(/old one still opens this workspace/);
  });

  it("reports how far a rekey has got, and nothing when none is running", async () => {
    const { result } = await mountLocked();
    expect(result.current.progress).toBeNull();

    await act(async () => {
      await result.current.change(PASSPHRASE, "second passphrase");
    });

    // Cleared once it is done, so no stale bar is left on screen.
    expect(result.current.progress).toBeNull();
    expect(result.current.state).toBe("unlocked");
  });

  it("follows a lock taken somewhere else, such as the Settings page", async () => {
    const { result } = await mountLocked();

    act(() => {
      lockWorkspace();
    });

    await waitFor(() => expect(result.current.state).toBe("locked"));
  });

  it("comes back interrupted, saying which passphrases would finish the job", async () => {
    await writeRekeyJournal({
      id: REKEY_JOURNAL_ID,
      source: null,
      target: {
        kdf: { name: "Argon2id", memorySize: 1024, iterations: 1, parallelism: 1, salt: "AAAA" },
        keyId: "target-key",
        verifier: "AAAA",
      },
      store: "notes-documents",
      lastKey: null,
      done: 0,
      total: 1,
      startedAt: 1,
    });

    const { result } = await mount();

    await waitFor(() => expect(result.current.state).toBe("interrupted"));
    expect(result.current.needed).toEqual(["target"]);
  });

  it("refuses a resume with the wrong passphrase and stays interrupted", async () => {
    const { result } = await mountLocked();

    // A journal written over a finished lock: the same state a closed tab leaves behind.
    await writeRekeyJournal({
      id: REKEY_JOURNAL_ID,
      source: null,
      target: {
        kdf: { name: "Argon2id", memorySize: 1024, iterations: 1, parallelism: 1, salt: "AAAA" },
        keyId: "target-key",
        verifier: "AAAA",
      },
      store: "notes-documents",
      lastKey: null,
      done: 0,
      total: 1,
      startedAt: 1,
    });
    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      expect(await result.current.resume({ target: "wrong" })).toBe(false);
    });

    expect(result.current.error).toMatch(/not the passphrase this workspace was being moved/);
    expect(result.current.state).toBe("interrupted");
  });

  it("says nothing was lost when a resume fails partway rather than being refused", async () => {
    const { result } = await mount();
    // A row neither key opens, or a database that went away mid-sweep: the resume throws
    // rather than reporting a wrong passphrase, and the workspace is still resumable.
    failures.resume = true;

    await act(async () => {
      expect(await result.current.resume({ target: PASSPHRASE })).toBe(false);
    });

    expect(result.current.error).toMatch(/Nothing was lost/);
  });

  it("finishes a rekey it can open, and the workspace comes back", async () => {
    const { result } = await mountLocked();

    // Turning the lock off is a rekey too; interrupting it leaves the same journal.
    const database = await getNotesDb();
    const record = await database.get("workspace-keys", "workspace");
    await writeRekeyJournal({
      id: REKEY_JOURNAL_ID,
      source: { kdf: record!.kdf, keyId: record!.keyId ?? "", verifier: record!.verifier },
      target: null,
      store: "notes-documents",
      lastKey: null,
      done: 0,
      total: 1,
      startedAt: 1,
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.needed).toEqual(["source"]);

    await act(async () => {
      expect(await result.current.resume({ source: PASSPHRASE })).toBe(true);
    });

    expect(result.current.state).toBe("unset");
  });

  it("paints locked on the first render when the hint says so, without waiting", async () => {
    await createWorkspaceLock(PASSPHRASE);
    lockWorkspace();

    const { result } = renderHook(() => useWorkspaceLock());

    // Straight away, before the database has been read.
    expect(result.current.state).toBe("locked");
  });

  it("corrects a stale hint that outlived the passphrase", async () => {
    window.localStorage.setItem("cuervo-workspace-locked", "1");

    const { result } = renderHook(() => useWorkspaceLock());
    expect(result.current.state).toBe("locked");

    await waitFor(() => expect(result.current.state).toBe("unset"));
  });
});
