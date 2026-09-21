import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetActiveCipher } from "@/lib/cipher";
import { getNotesDb } from "@/lib/notes-db";
import { createWorkspaceLock, lockWorkspace } from "@/lib/workspace-lock";

import { useWorkspaceLock } from "./use-workspace-lock";

const PASSPHRASE = "correct horse battery";

// The shipped 600,000 iterations would make each of these take seconds.
vi.mock("@/lib/crypto-envelope", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crypto-envelope")>()),
  PBKDF2_ITERATIONS: 100,
}));

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([database.clear("workspace-keys"), database.clear("notes-documents")]);
  window.localStorage.clear();
  resetActiveCipher();
});

async function mount() {
  const hook = renderHook(() => useWorkspaceLock());
  await waitFor(() => expect(hook.result.current.state).not.toBeNull());
  return hook;
}

describe("useWorkspaceLock", () => {
  it("starts unset when no passphrase has been chosen", async () => {
    const { result } = await mount();

    expect(result.current.state).toBe("unset");
    expect(result.current.error).toBeNull();
  });

  it("sets a passphrase and comes back unlocked", async () => {
    const { result } = await mount();

    await act(async () => {
      expect(await result.current.create(PASSPHRASE)).toBe(true);
    });

    expect(result.current.state).toBe("unlocked");
  });

  it("reports a failure to set one without changing the state", async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.create(PASSPHRASE);
    });

    // A second passphrase over the first is refused by the storage layer.
    await act(async () => {
      expect(await result.current.create("another")).toBe(false);
    });

    expect(result.current.error).toMatch(/Nothing was changed/);
    expect(result.current.state).toBe("unlocked");
  });

  it("locks, then unlocks with the right passphrase", async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.create(PASSPHRASE);
    });

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
    const { result } = await mount();
    await act(async () => {
      await result.current.create(PASSPHRASE);
      await result.current.lock();
    });

    await act(async () => {
      expect(await result.current.unlock("wrong")).toBe(false);
    });

    expect(result.current.state).toBe("locked");
    expect(result.current.error).toMatch(/does not unlock/);
  });

  it("removes the passphrase with the right one, and refuses the wrong one", async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.create(PASSPHRASE);
    });

    await act(async () => {
      expect(await result.current.remove("wrong")).toBe(false);
    });
    expect(result.current.error).toMatch(/not the one this workspace was locked with/);
    expect(result.current.state).toBe("unlocked");

    await act(async () => {
      expect(await result.current.remove(PASSPHRASE)).toBe(true);
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
