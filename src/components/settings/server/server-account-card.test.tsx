import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AccountRecord } from "@/lib/account/account-record";

import { ServerAccountCard } from "./server-account-card";

/** Only who and where are read by the card; the sealed parts are placeholders. */
const RECORD: AccountRecord = {
  id: "account",
  email: "ada@example.com",
  baseUrl: "https://sync.example.org",
  material: {
    kdf: { name: "Argon2id", memorySize: 1024, iterations: 1, parallelism: 1, salt: "c2FsdA" },
    sealedAccountKey: "c2VhbGVk",
    publicKey: "cHVibGlj",
    sealedPrivateKey: "c2VhbGVk",
  },
  wingKeyId: "wing-key",
  wrappedWingKey: "d3JhcHBlZA",
  graph: { keys: [], wraps: [], grants: [] },
  updatedAt: 1,
};

/** What `useServerAccount` hands the card, with every action a spy. */
function setup(overrides: Partial<Parameters<typeof ServerAccountCard>[0]> = {}) {
  const props = {
    record: null,
    status: "disconnected" as const,
    serverUrl: "https://sync.example.org",
    defaultServerUrl: null,
    hasContent: false,
    error: null,
    isWorking: false,
    lastSync: null,
    isConnected: false,
    changeServer: vi.fn(() => true),
    resetServer: vi.fn(() => true),
    createAccount: vi.fn(() => Promise.resolve(true)),
    signIn: vi.fn(() => Promise.resolve(true)),
    disconnect: vi.fn(() => Promise.resolve(true)),
    deleteServerAccount: vi.fn(() => Promise.resolve(true)),
    sync: vi.fn(() => Promise.resolve(true)),
    sessionFor: vi.fn(() => null),
    refresh: vi.fn(() => Promise.resolve()),
    localEmail: "ada@example.com",
    ...overrides,
  };

  render(<ServerAccountCard {...props} />);

  return { user: userEvent.setup(), props };
}

const connected = {
  record: RECORD,
  status: "connected" as const,
  isConnected: true,
};

describe("ServerAccountCard, not connected", () => {
  it("creates an account with the local email and the device's passphrase", async () => {
    const { user, props } = setup();

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    await user.type(screen.getByLabelText("This device's passphrase"), "secret");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(props.createAccount).toHaveBeenCalledWith("ada@example.com", "secret");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("asks what to keep when signing in over notes already here", async () => {
    const { user, props } = setup({ hasContent: true });

    await user.click(screen.getByRole("button", { name: "Sign in to an existing account" }));
    await user.click(screen.getByRole("button", { name: "Use the account's" }));
    await user.type(screen.getByLabelText("Account passphrase"), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(props.signIn).toHaveBeenCalledWith("ada@example.com", "secret", "replace");
  });

  it("replaces an empty device without asking, and can be cancelled", async () => {
    const { user, props } = setup();

    await user.click(screen.getByRole("button", { name: "Sign in to an existing account" }));
    expect(screen.queryByText("This device already has notes")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Sign in to an existing account" }));
    await user.type(screen.getByLabelText("Account passphrase"), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(props.signIn).toHaveBeenCalledWith("ada@example.com", "secret", "replace");

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.createAccount).not.toHaveBeenCalled();
  });

  it("offers no account until a server is chosen, and takes one", async () => {
    const { user, props } = setup({ serverUrl: null, defaultServerUrl: "https://build.example" });

    expect(screen.getByText(/No server: this device keeps everything/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create an account" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Server address"), "https://mine.example");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(props.changeServer).toHaveBeenCalledWith("https://mine.example");

    await user.click(screen.getByRole("button", { name: "Use this app's default server" }));
    expect(props.resetServer).toHaveBeenCalled();
  });

  it("clears the server when the address is emptied", async () => {
    const { user, props } = setup();

    await user.clear(screen.getByLabelText("Server address"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(props.changeServer).toHaveBeenCalledWith(null);
  });
});

describe("ServerAccountCard, connected", () => {
  it("holds the server in place and syncs on request", async () => {
    const { user, props } = setup({
      ...connected,
      lastSync: { pushed: 2, applied: 1, media: 1, at: 1 },
      error: "Could not reach the server.",
    });

    expect(screen.getByLabelText("Server address")).toBeDisabled();
    expect(screen.getByText(/Disconnect from this server before/)).toBeInTheDocument();
    expect(screen.getByText(/Sent 2, received 1, and 1 file\./)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the server.");

    await user.click(screen.getByRole("button", { name: "Sync now" }));
    expect(props.sync).toHaveBeenCalled();
  });

  it("disconnects, or deletes the account, only with the passphrase", async () => {
    const { user, props } = setup(connected);

    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.type(screen.getByLabelText("Your passphrase"), "secret");
    await user.click(screen.getByRole("button", { name: "Disconnect this device" }));
    expect(props.disconnect).toHaveBeenCalledWith("secret");

    await user.click(screen.getByRole("button", { name: "Delete server account" }));
    await user.type(screen.getByLabelText("Your passphrase"), "secret{Enter}");
    expect(props.deleteServerAccount).toHaveBeenCalledWith("secret");

    await user.click(screen.getByRole("button", { name: "Delete server account" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Your passphrase")).not.toBeInTheDocument();
  });
});
