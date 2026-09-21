import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LockCard } from "./lock-card";

function setup(overrides: Partial<Parameters<typeof LockCard>[0]> = {}) {
  const props = {
    state: "unset" as const,
    error: null,
    isWorking: false,
    onCreate: vi.fn(),
    onChange: vi.fn(),
    onRemove: vi.fn(),
    onLock: vi.fn(),
    ...overrides,
  };

  render(<LockCard {...props} />);
  return props;
}

describe("LockCard", () => {
  it("offers to set a passphrase while there is none", () => {
    setup();

    expect(screen.getByRole("button", { name: "Set a passphrase" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lock now" })).not.toBeInTheDocument();
  });

  it("says what the lock covers and what it does not, rather than implying everything", () => {
    setup();

    expect(screen.getByText(/note titles, course names, task titles/i)).toBeVisible();
    expect(screen.getByText(/due dates and times stay readable/i)).toBeVisible();
  });

  it("warns that nothing can reset the passphrase before it is chosen", async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();

    await user.click(screen.getByRole("button", { name: "Set a passphrase" }));

    expect(
      screen.getByText(/nothing can reset it: forget it and the notes are gone/i),
    ).toBeVisible();

    await user.type(screen.getByLabelText("Choose a passphrase"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Encrypt this workspace" }));

    expect(onCreate).toHaveBeenCalledWith("correct horse");
  });

  it("will not submit an empty passphrase", async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();

    await user.click(screen.getByRole("button", { name: "Set a passphrase" }));

    expect(screen.getByRole("button", { name: "Encrypt this workspace" })).toBeDisabled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("offers to lock now and to remove the passphrase once one is set", async () => {
    const user = userEvent.setup();
    const { onLock, onRemove } = setup({ state: "unlocked" });

    await user.click(screen.getByRole("button", { name: "Lock now" }));
    expect(onLock).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Remove the passphrase" }));
    await user.type(screen.getByLabelText("Confirm the passphrase"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Remove and decrypt" }));

    expect(onRemove).toHaveBeenCalledWith("correct horse");
  });

  it("says a removal writes the notes back unencrypted", async () => {
    const user = userEvent.setup();
    setup({ state: "unlocked" });

    await user.click(screen.getByRole("button", { name: "Remove the passphrase" }));

    expect(screen.getByText(/writes every note back unencrypted/i)).toBeVisible();
  });

  it("backs out of either passphrase prompt without doing anything", async () => {
    const user = userEvent.setup();
    const { onCreate, onRemove } = setup();

    await user.click(screen.getByRole("button", { name: "Set a passphrase" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Choose a passphrase")).not.toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("backs out of removing the passphrase", async () => {
    const user = userEvent.setup();
    const { onRemove } = setup({ state: "unlocked" });

    await user.click(screen.getByRole("button", { name: "Remove the passphrase" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Confirm the passphrase")).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("offers to change the passphrase once one is set, and not before", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ state: "unlocked" });

    await user.click(screen.getByRole("button", { name: "Change the passphrase" }));
    await user.type(screen.getByLabelText("Current passphrase"), "correct horse");
    await user.type(screen.getByLabelText("New passphrase"), "battery staple");
    await user.click(screen.getByRole("button", { name: "Re-encrypt with the new passphrase" }));

    expect(onChange).toHaveBeenCalledWith("correct horse", "battery staple");
  });

  it("does not offer to change a passphrase that does not exist yet", () => {
    setup();

    expect(screen.queryByRole("button", { name: "Change the passphrase" })).not.toBeInTheDocument();
  });

  it("will not change to or from an empty passphrase", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ state: "unlocked" });

    await user.click(screen.getByRole("button", { name: "Change the passphrase" }));
    await user.type(screen.getByLabelText("Current passphrase"), "correct horse");

    expect(
      screen.getByRole("button", { name: "Re-encrypt with the new passphrase" }),
    ).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("backs out of changing the passphrase", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ state: "unlocked" });

    await user.click(screen.getByRole("button", { name: "Change the passphrase" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Current passphrase")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows an error where it can be read", () => {
    setup({ state: "unlocked", error: "That passphrase is not the one." });

    expect(screen.getByRole("alert")).toHaveTextContent("That passphrase is not the one.");
  });

  it("disables everything while it is working, because a rekey is not instant", () => {
    setup({ isWorking: true });

    expect(screen.getByRole("button", { name: "Set a passphrase" })).toBeDisabled();
  });
});
