import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readAccountRecord } from "@/lib/account/account-record";
import { createLocalAccount } from "@/lib/account/device-account";
import { readLocalAccount } from "@/lib/account/local-account";
import { enrolServerAccount } from "@/lib/account/server-connect";
import { setApiSession } from "@/lib/api/session-store";
import { resetActiveCipher } from "@/lib/crypto/cipher";
import { eraseNotesDb } from "@/lib/db/notes-db";
import { forgetKeyring } from "@/lib/keys/object-keys";
import { resetSyncState } from "@/lib/sync/sync-service";
import { startFakeSyncServer } from "@/test/fake-sync-server";

import { AccountSection } from "./account-section";

vi.mock("@/lib/crypto/kdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crypto/kdf")>()),
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

beforeEach(async () => {
  resetActiveCipher();
  forgetKeyring();
  setApiSession(null);
  resetSyncState();
  await eraseNotesDb();
  await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: PASSPHRASE });
});

function setup(isServerConnected = false) {
  const onErased = vi.fn();

  render(<AccountSection isServerConnected={isServerConnected} onErased={onErased} />);

  return { user: userEvent.setup(), onErased };
}

async function openErase(user: ReturnType<typeof userEvent.setup>, passphrase: string) {
  await user.click(await screen.findByRole("button", { name: "Delete this device's account" }));
  await user.type(screen.getByLabelText("Your passphrase"), passphrase);
  await user.type(screen.getByLabelText("Type ERASE to confirm"), "ERASE");
}

describe("AccountSection", () => {
  it("refuses a name the account cannot hold", async () => {
    const { user } = setup();

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "x".repeat(81));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not one this account can take/);
    expect((await readLocalAccount())?.name).toBe("Ada");
  });

  it("erases nothing for the wrong passphrase, and everything for the right one", async () => {
    const { user, onErased } = setup();

    await openErase(user, "wrong");
    await user.click(screen.getByRole("button", { name: "Erase this device" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Nothing was erased/);
    expect(await readLocalAccount()).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await openErase(user, PASSPHRASE);
    await user.click(screen.getByRole("button", { name: "Erase this device" }));

    await waitFor(() => expect(onErased).toHaveBeenCalled());
    expect(await readLocalAccount()).toBeNull();
  });

  it("deletes the server account first when asked, and keeps everything if it cannot", async () => {
    const fake = startFakeSyncServer();
    await enrolServerAccount({ email: EMAIL, passphrase: PASSPHRASE, baseUrl: fake.baseUrl });
    const { user, onErased } = setup(true);

    // A server that has gone away: the delete fails, so the device is kept whole.
    setApiSession({ baseUrl: "https://nowhere.example.test", token: "stale" });
    await openErase(user, PASSPHRASE);
    await user.click(screen.getByRole("checkbox", { name: /Also delete my server account/ }));
    await user.click(screen.getByRole("button", { name: "Erase this device" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be deleted/);
    expect(await readAccountRecord()).not.toBeNull();

    setApiSession(null);
    await user.click(screen.getByRole("button", { name: "Erase this device" }));

    await waitFor(() => expect(onErased).toHaveBeenCalled());
    expect(fake.account(EMAIL)).toBeUndefined();
  });
});
