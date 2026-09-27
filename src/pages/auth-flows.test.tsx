import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readAccountRecord } from "@/lib/account/account-record";
import { createLocalAccount } from "@/lib/account/device-account";
import { readLocalAccount } from "@/lib/account/local-account";
import { enrolServerAccount } from "@/lib/account/server-connect";
import { readServerUrl } from "@/lib/api/server-url";
import { getApiSession, setApiSession } from "@/lib/api/session-store";
import { resetActiveCipher } from "@/lib/crypto/cipher";
import { eraseNotesDb } from "@/lib/db/notes-db";
import { ensureDefaultWorkspace } from "@/lib/hierarchy/workspace-storage";
import { forgetKeyring } from "@/lib/keys/object-keys";
import { lockWorkspace } from "@/lib/lock/workspace-lock";
import { createWorkspaceLock } from "@/lib/lock/workspace-passphrase";
import { createNotesDirectoryEntry } from "@/lib/notes/notes-directory-storage";
import { resetSyncState, runSyncRound } from "@/lib/sync/sync-service";
import { startFakeSyncServer } from "@/test/fake-sync-server";

import { SignInPage } from "./signin";
import { SignupPage } from "./signup";

// Argon2id at its real cost is a second a call; these flows derive many times.
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
  window.localStorage.clear();
}

beforeEach(async () => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  await freshDevice();
  fake = startFakeSyncServer();
});

function renderAt(path: "/auth/signup" | "/auth/signin") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/signup" element={<SignupPage />} />
        <Route path="/auth/signin" element={<SignInPage />} />
        <Route path="/auth/onboarding" element={<p>Onboarding</p>} />
        <Route path="/dashboard" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );

  return userEvent.setup();
}

async function writeNote(title: string) {
  const { path } = await ensureDefaultWorkspace();
  await createNotesDirectoryEntry({ branchId: path.branch.id, feather: title });
}

/** An account on the fake server, made from another device that is then wiped. */
async function accountElsewhere() {
  await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: PASSPHRASE });
  await writeNote("Mitosis");
  await enrolServerAccount({ email: EMAIL, passphrase: PASSPHRASE, baseUrl: fake.baseUrl });
  await runSyncRound();
  await freshDevice();
}

describe("creating an account", () => {
  async function fillLocal(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText("Name"), "Ada");
    await user.type(screen.getByLabelText("Email"), EMAIL);
    await user.type(screen.getByLabelText("Passphrase"), PASSPHRASE);
    await user.type(screen.getByLabelText("Confirm passphrase"), PASSPHRASE);
  }

  it("makes the local account on this device and goes on to onboarding", async () => {
    const user = renderAt("/auth/signup");

    await fillLocal(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Onboarding")).toBeInTheDocument();
    expect(await readLocalAccount()).toMatchObject({ name: "Ada", email: EMAIL });
    expect(await readAccountRecord()).toBeNull();
  });

  it("makes a sync account at the same time, on the server named", async () => {
    const user = renderAt("/auth/signup");

    await fillLocal(user);
    await user.click(screen.getByRole("checkbox", { name: /sync account/ }));
    await user.type(screen.getByLabelText("Server address"), fake.baseUrl);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Onboarding")).toBeInTheDocument();
    expect(await readAccountRecord()).toMatchObject({ email: EMAIL, baseUrl: fake.baseUrl });
    expect(readServerUrl()).toBe(fake.baseUrl);
  });

  it("keeps the local account when the server is not there, and says so", async () => {
    const user = renderAt("/auth/signup");

    await fillLocal(user);
    await user.click(screen.getByRole("checkbox", { name: /sync account/ }));
    await user.type(screen.getByLabelText("Server address"), "https://nowhere.example.test");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Your account is ready")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be reached/);
    expect(await readLocalAccount()).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Onboarding")).toBeInTheDocument();
  });

  it("says when the server already has an account under that address", async () => {
    await accountElsewhere();
    const user = renderAt("/auth/signup");

    await fillLocal(user);
    await user.click(screen.getByRole("checkbox", { name: /sync account/ }));
    await user.type(screen.getByLabelText("Server address"), fake.baseUrl);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already has an account there/);
  });

  it("asks an older, locked device for the passphrase it already has", async () => {
    await createWorkspaceLock(PASSPHRASE);
    lockWorkspace();
    const user = renderAt("/auth/signup");

    await user.type(await screen.findByLabelText("Name"), "Ada");
    await user.type(screen.getByLabelText("Email"), EMAIL);
    await user.type(screen.getByLabelText("This device's passphrase"), "not it");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not the passphrase/);
    expect(await readLocalAccount()).toBeNull();
  });

  it("points a device that has its account to signing in instead", async () => {
    await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: PASSPHRASE });
    const user = renderAt("/auth/signup");

    expect(await screen.findByText("This device already has an account")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/You're signed in, Ada/)).toBeInTheDocument();
  });
});

describe("signing in", () => {
  it("opens a locked device with its passphrase, and nothing else", async () => {
    await createLocalAccount({ name: "Ada", email: EMAIL, passphrase: PASSPHRASE });
    lockWorkspace();
    const user = renderAt("/auth/signin");

    expect(await screen.findByText("Welcome back, Ada")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your passphrase")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Passphrase"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/does not open this device/);

    await user.clear(screen.getByLabelText("Passphrase"));
    await user.type(screen.getByLabelText("Passphrase"), PASSPHRASE);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  });

  it("sends a device with a passphrase but no account to set one up", async () => {
    await createWorkspaceLock(PASSPHRASE);
    renderAt("/auth/signin");

    expect(await screen.findByLabelText("This device's passphrase")).toBeInTheDocument();
  });

  it("brings a sync account to a new device, which then has its own local account", async () => {
    await accountElsewhere();
    const user = renderAt("/auth/signin");

    await user.type(await screen.findByLabelText("Server address"), fake.baseUrl);
    await user.type(screen.getByLabelText("Email"), EMAIL);
    await user.type(screen.getByLabelText("Passphrase"), "wrong");
    await user.type(screen.getByLabelText("Your name on this device"), "Ada");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not open an account/);
    expect(screen.queryByText("This device already has notes")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Passphrase"));
    await user.type(screen.getByLabelText("Passphrase"), PASSPHRASE);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(await readLocalAccount()).toMatchObject({ name: "Ada", email: EMAIL });
    expect(readServerUrl()).toBe(fake.baseUrl);
    await waitFor(() => expect(getApiSession()?.token).toBeTruthy());
  });

  it("asks what to do with notes already on the device", async () => {
    await accountElsewhere();
    await writeNote("Meiosis");
    const user = renderAt("/auth/signin");

    expect(await screen.findByText("This device already has notes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use the account's" }));
    expect(screen.getByText(/erased and replaced/)).toBeInTheDocument();
  });
});
