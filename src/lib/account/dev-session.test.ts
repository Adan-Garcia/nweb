import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveCipher, resetActiveCipher } from "../crypto/cipher";
import { eraseNotesDb } from "../db/notes-db";
import { forgetKeyring } from "../keys/object-keys";
import { getWorkspaceLockState, lockWorkspace } from "../lock/workspace-lock";
import { DEV_SESSION_ACCOUNT, startDevSession } from "./dev-session";
import { createLocalAccount } from "./device-account";
import { readLocalAccount } from "./local-account";

// Argon2id at its real cost is a second a call.
vi.mock("../crypto/kdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../crypto/kdf")>()),
  createKdfParams: () => ({
    name: "Argon2id" as const,
    memorySize: 1024,
    iterations: 1,
    parallelism: 1,
    salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
  }),
}));

beforeEach(async () => {
  resetActiveCipher();
  forgetKeyring();
  await eraseNotesDb();
});

describe("startDevSession", () => {
  it("makes the dev account on a fresh device and leaves the workspace open", async () => {
    expect(await startDevSession()).toBe("created");

    expect(await readLocalAccount()).toMatchObject({ name: "Dev", email: "dev@example.com" });
    expect(getActiveCipher().name).toBe("aes-gcm");
  });

  it("unlocks the dev account on every load after, and leaves an open one alone", async () => {
    await startDevSession();
    expect(await startDevSession()).toBe("already-open");

    await lockWorkspace();
    expect(await getWorkspaceLockState()).toBe("locked");

    expect(await startDevSession()).toBe("unlocked");
    expect(await getWorkspaceLockState()).toBe("unlocked");
  });

  it("leaves someone else's account locked rather than touching it", async () => {
    await createLocalAccount({
      name: "Ada",
      email: "ada@example.com",
      passphrase: "not the dev one",
    });
    await lockWorkspace();

    expect(await startDevSession()).toBe("not-ours");

    expect(await getWorkspaceLockState()).toBe("locked");
    expect(await readLocalAccount()).toMatchObject({ name: "Ada" });
  });

  it("says so when an older device's lock is not the dev passphrase", async () => {
    const { createWorkspaceLock } = await import("../lock/workspace-passphrase");
    await createWorkspaceLock("an older passphrase");

    expect(await startDevSession()).toBe("not-ours");
    expect(await readLocalAccount()).toBeNull();
  });

  it("uses a passphrase that is nobody's secret", () => {
    expect(DEV_SESSION_ACCOUNT.passphrase).toBe("dev session passphrase");
  });
});
