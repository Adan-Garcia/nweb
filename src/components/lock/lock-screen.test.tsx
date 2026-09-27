import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { writeLocalAccount } from "@/lib/account/local-account";
import { resetActiveCipher } from "@/lib/crypto/cipher";
import { getNotesDb } from "@/lib/db/notes-db";
import { lockWorkspace } from "@/lib/lock/workspace-lock";
import { createWorkspaceLock } from "@/lib/lock/workspace-passphrase";

import { LockScreen } from "./lock-screen";

// The shipped Argon2id cost — 64 MiB, three passes — would make the shell test take a
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

describe("LockScreen", () => {
  function setup(overrides: Partial<Parameters<typeof LockScreen>[0]> = {}) {
    const props = { name: null, error: null, isWorking: false, onUnlock: vi.fn(), ...overrides };
    render(<LockScreen {...props} />);
    return props;
  }

  it("asks for the passphrase and says nothing can reset it", () => {
    setup();

    expect(screen.getByRole("heading", { name: /locked/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing can reset it/i)).toBeVisible();
  });

  it("greets the owner by the local account's name", () => {
    setup({ name: "Ada" });

    expect(screen.getByRole("heading", { name: "Welcome back, Ada" })).toBeInTheDocument();
  });

  it("submits the passphrase, and will not submit an empty one", async () => {
    const user = userEvent.setup();
    const { onUnlock } = setup();

    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();

    await user.type(screen.getByLabelText("Passphrase"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(onUnlock).toHaveBeenCalledWith("correct horse");
  });

  it("shows a wrong passphrase where a screen reader will announce it", () => {
    setup({ error: "That passphrase does not unlock this workspace." });

    expect(screen.getByRole("alert")).toHaveTextContent("does not unlock this workspace");
  });
});

describe("the workspace behind the lock", () => {
  beforeEach(async () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });

    const database = await getNotesDb();
    await database.clear("workspace-keys");
    await database.clear("local-account");
    window.localStorage.clear();
    resetActiveCipher();
  });

  it("renders the workspace when no passphrase has been set", async () => {
    render(
      <MemoryRouter>
        <WorkspaceShell>
          <p>Workspace contents</p>
        </WorkspaceShell>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Workspace contents")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /locked/i })).not.toBeInTheDocument();
  });

  it("replaces the whole workspace with the lock screen once it is locked", async () => {
    await createWorkspaceLock("correct horse");
    lockWorkspace();

    render(
      <MemoryRouter>
        <WorkspaceShell>
          <p>Workspace contents</p>
        </WorkspaceShell>
      </MemoryRouter>,
    );

    // Not merely hidden: the workspace is not rendered at all while locked.
    expect(await screen.findByRole("heading", { name: /locked/i })).toBeInTheDocument();
    expect(screen.queryByText("Workspace contents")).not.toBeInTheDocument();
  });

  it("names whose workspace it is once the device has its local account", async () => {
    await createWorkspaceLock("correct horse");
    await writeLocalAccount({ name: "Ada", email: "ada@example.com" });
    lockWorkspace();

    render(
      <MemoryRouter>
        <WorkspaceShell>
          <p>Workspace contents</p>
        </WorkspaceShell>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome back, Ada" })).toBeInTheDocument();
  });

  it("shows the workspace again once the passphrase is accepted", async () => {
    const user = userEvent.setup();
    await createWorkspaceLock("correct horse");
    lockWorkspace();

    render(
      <MemoryRouter>
        <WorkspaceShell>
          <p>Workspace contents</p>
        </WorkspaceShell>
      </MemoryRouter>,
    );

    await user.type(await screen.findByLabelText("Passphrase"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText("Workspace contents")).toBeInTheDocument();
  });

  it("keeps the lock screen up for the wrong passphrase", async () => {
    const user = userEvent.setup();
    await createWorkspaceLock("correct horse");
    lockWorkspace();

    render(
      <MemoryRouter>
        <WorkspaceShell>
          <p>Workspace contents</p>
        </WorkspaceShell>
      </MemoryRouter>,
    );

    await user.type(await screen.findByLabelText("Passphrase"), "wrong");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("does not unlock this workspace");
    expect(screen.queryByText("Workspace contents")).not.toBeInTheDocument();
  });
});
