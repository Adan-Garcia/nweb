import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AccountCard } from "./account-card";

function setup(overrides: Partial<Parameters<typeof AccountCard>[0]> = {}) {
  const props = {
    status: "none" as const,
    email: null,
    hasServer: true,
    isWorking: false,
    isLockSet: false,
    error: null,
    lastSync: null,
    onCreate: vi.fn(),
    onSignIn: vi.fn(),
    onSignOut: vi.fn(),
    onSync: vi.fn(),
    ...overrides,
  };

  render(<AccountCard {...props} />);

  return props;
}

describe("AccountCard", () => {
  it("offers an account when there is a server and none yet", () => {
    setup();

    expect(screen.getByRole("button", { name: "Create an account" })).toBeInTheDocument();
  });

  it("offers nothing when the build has no server, and says why", () => {
    setup({ hasServer: false });

    expect(screen.queryByRole("button", { name: "Create an account" })).not.toBeInTheDocument();
    expect(screen.getByText(/no server configured/i)).toBeInTheDocument();
  });

  it("takes an address and a passphrase, and asks for neither twice", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Account passphrase"), "a long passphrase");
    await user.click(screen.getByRole("button", { name: "Create the account" }));

    expect(props.onCreate).toHaveBeenCalledWith(
      "owner@example.com",
      "a long passphrase",
      undefined,
    );
  });

  it("asks for the workspace passphrase too when there is a lock to move", async () => {
    const user = userEvent.setup();
    const props = setup({ isLockSet: true });

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Account passphrase"), "a long passphrase");

    // Incomplete until the current one is given: the notes have to be read before they can
    // be written back under the account's key.
    expect(screen.getByRole("button", { name: "Create the account" })).toBeDisabled();

    await user.type(screen.getByLabelText("This workspace’s passphrase"), "the old one");
    await user.click(screen.getByRole("button", { name: "Create the account" }));

    expect(props.onCreate).toHaveBeenCalledWith(
      "owner@example.com",
      "a long passphrase",
      "the old one",
    );
  });

  it("will not submit an address that is not one", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Email"), "not-an-address");
    await user.type(screen.getByLabelText("Account passphrase"), "a long passphrase");

    expect(screen.getByRole("button", { name: "Create the account" })).toBeDisabled();
    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it("can be backed out of", async () => {
    const user = userEvent.setup();

    setup();
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Create an account" })).toBeInTheDocument();
  });

  it("asks for the passphrase when this device knows the account but is not open", async () => {
    const user = userEvent.setup();
    const props = setup({ status: "locked", email: "owner@example.com" });

    expect(screen.getByText(/no network is needed/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Passphrase for owner@example.com"), "the passphrase");
    await user.click(screen.getByRole("button", { name: "Open this workspace" }));

    expect(props.onSignIn).toHaveBeenCalledWith("the passphrase");
  });

  it("offers to sync and to sign out once it is open", async () => {
    const user = userEvent.setup();
    const props = setup({ status: "ready", email: "owner@example.com" });

    await user.click(screen.getByRole("button", { name: "Sync now" }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(props.onSync).toHaveBeenCalled();
    expect(props.onSignOut).toHaveBeenCalled();
  });

  it("says what the last sync moved", () => {
    setup({
      status: "ready",
      email: "owner@example.com",
      lastSync: { pushed: 3, applied: 2, media: 1, at: Date.now() },
    });

    expect(screen.getByText(/Sent 3, received 2, and 1 file\./)).toBeInTheDocument();
  });

  it("pluralises the file count, because one file is not 1 files", () => {
    setup({
      status: "ready",
      email: "owner@example.com",
      lastSync: { pushed: 0, applied: 0, media: 2, at: Date.now() },
    });

    expect(screen.getByText(/and 2 files\./)).toBeInTheDocument();
  });

  it("reports a failure where a screen reader will hear it", () => {
    setup({ error: "The server would not take that address." });

    expect(screen.getByRole("alert")).toHaveTextContent("would not take that address");
  });

  it("is plain about what the server can still see", () => {
    setup({ status: "ready", email: "owner@example.com" });

    // Zero knowledge about content is not zero knowledge about structure, and a card that
    // implied otherwise would be the dishonest part of this feature.
    expect(screen.getByText(/when things are due/i)).toBeInTheDocument();
  });
});
