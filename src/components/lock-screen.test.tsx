import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceShell } from "@/components/workspace-shell";
import { resetActiveCipher } from "@/lib/cipher";
import { getNotesDb } from "@/lib/notes-db";
import { lockWorkspace } from "@/lib/workspace-lock";
import { createWorkspaceLock } from "@/lib/workspace-passphrase";

import { LockScreen } from "./lock-screen";

// The shipped iteration count would make the shell test take seconds.
vi.mock("@/lib/crypto-envelope", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crypto-envelope")>()),
  PBKDF2_ITERATIONS: 100,
}));

describe("LockScreen", () => {
  function setup(overrides: Partial<Parameters<typeof LockScreen>[0]> = {}) {
    const props = { error: null, isWorking: false, onUnlock: vi.fn(), ...overrides };
    render(<LockScreen {...props} />);
    return props;
  }

  it("asks for the passphrase and says nothing can reset it", () => {
    setup();

    expect(screen.getByRole("heading", { name: /locked/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing can reset this/i)).toBeVisible();
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
    window.localStorage.clear();
    resetActiveCipher();
  });

  it("renders the workspace when no passphrase has been set", async () => {
    render(
      <MemoryRouter>
        <WorkspaceShell isDark={false} onToggleTheme={vi.fn()}>
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
        <WorkspaceShell isDark={false} onToggleTheme={vi.fn()}>
          <p>Workspace contents</p>
        </WorkspaceShell>
      </MemoryRouter>,
    );

    // Not merely hidden: the workspace is not rendered at all while locked.
    expect(await screen.findByRole("heading", { name: /locked/i })).toBeInTheDocument();
    expect(screen.queryByText("Workspace contents")).not.toBeInTheDocument();
  });

  it("shows the workspace again once the passphrase is accepted", async () => {
    const user = userEvent.setup();
    await createWorkspaceLock("correct horse");
    lockWorkspace();

    render(
      <MemoryRouter>
        <WorkspaceShell isDark={false} onToggleTheme={vi.fn()}>
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
        <WorkspaceShell isDark={false} onToggleTheme={vi.fn()}>
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
