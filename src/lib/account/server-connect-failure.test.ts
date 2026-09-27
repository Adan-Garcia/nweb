import { beforeEach, describe, expect, it, vi } from "vitest";

import { startFakeSyncServer } from "@/test/fake-sync-server";

import { setApiSession } from "../api/session-store";
import { resetActiveCipher } from "../crypto/cipher";
import { eraseNotesDb } from "../db/notes-db";
import { ensureDefaultWorkspace } from "../hierarchy/workspace-storage";
import { forgetKeyring } from "../keys/object-keys";
import {
  createNotesDirectoryEntry,
  listNotesDirectoryEntries,
} from "../notes/notes-directory-storage";
import { resetSyncState, runSyncRound } from "../sync/sync-service";
import { createLocalAccount } from "./device-account";
import { enrolServerAccount, signInToServer } from "./server-connect";

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

/** Flipped to make recording the account fail, the way a full disk or a closed tab would. */
const failures = vi.hoisted(() => ({ record: false }));

vi.mock("./account-record", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./account-record")>();

  return {
    ...actual,
    writeAccountRecord: (...args: Parameters<typeof actual.writeAccountRecord>) => {
      if (failures.record) {
        return Promise.reject(new Error("QuotaExceededError"));
      }

      return actual.writeAccountRecord(...args);
    },
  };
});

const EMAIL = "ada@example.com";
const PASSPHRASE = "correct horse battery";

async function freshDevice() {
  resetActiveCipher();
  forgetKeyring();
  setApiSession(null);
  resetSyncState();
  await eraseNotesDb();
}

async function writeNote(title: string) {
  const { path } = await ensureDefaultWorkspace();
  await createNotesDirectoryEntry({ branchId: path.branch.id, feather: title });
}

beforeEach(async () => {
  failures.record = false;
  await freshDevice();
});

describe("signing in when the device cannot record the account", () => {
  it.each(["replace", "merge"] as const)(
    "keeps this device's notes as they were (%s)",
    async (mode) => {
      const fake = startFakeSyncServer();
      await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: PASSPHRASE });
      await writeNote("Mitosis");
      await enrolServerAccount({ email: EMAIL, passphrase: PASSPHRASE, baseUrl: fake.baseUrl });
      await runSyncRound();
      await freshDevice();

      await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: PASSPHRASE });
      await writeNote("Only on this laptop");
      failures.record = true;

      await expect(
        signInToServer({ email: EMAIL, passphrase: PASSPHRASE, baseUrl: fake.baseUrl, mode }),
      ).rejects.toThrow();

      // Nothing was erased, and nothing was moved to a key this device does not hold.
      expect((await listNotesDirectoryEntries()).map((entry) => entry.feather)).toEqual([
        "Only on this laptop",
      ]);
    },
  );
});
