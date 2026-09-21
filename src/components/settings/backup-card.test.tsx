import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BackupCard } from "./backup-card";

function setup(overrides: Partial<Parameters<typeof BackupCard>[0]> = {}) {
  const props = {
    status: { kind: "idle" } as const,
    needsPassphrase: false,
    restoreMode: "replace" as const,
    onChooseRestoreMode: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    onUnlock: vi.fn(),
    onCancelUnlock: vi.fn(),
    ...overrides,
  };

  render(<BackupCard {...props} />);
  return props;
}

describe("BackupCard", () => {
  it("downloads a plain backup without asking for anything", async () => {
    const user = userEvent.setup();
    const { onExport } = setup();

    await user.click(screen.getByRole("button", { name: /Download backup/ }));

    expect(onExport).toHaveBeenCalledWith();
  });

  it("asks for a passphrase before an encrypted one, and says nothing can reset it", async () => {
    const user = userEvent.setup();
    const { onExport } = setup();

    await user.click(screen.getByRole("button", { name: /Encrypt a backup/ }));
    expect(screen.getByText(/nothing can reset it/i)).toBeVisible();

    await user.type(screen.getByLabelText("Passphrase for this backup"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Download encrypted backup" }));

    expect(onExport).toHaveBeenCalledWith("correct horse");
  });

  it("backs out of encrypting without exporting", async () => {
    const user = userEvent.setup();
    const { onExport } = setup();

    await user.click(screen.getByRole("button", { name: /Encrypt a backup/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Passphrase for this backup")).not.toBeInTheDocument();
    expect(onExport).not.toHaveBeenCalled();
  });

  it("offers to replace or to merge, and says what each does to what is here", async () => {
    const user = userEvent.setup();
    const { onChooseRestoreMode } = setup();

    expect(screen.getByRole("radio", { name: /Replace everything/ })).toBeChecked();
    expect(screen.getByText(/Anything written since it was exported is lost/)).toBeVisible();

    await user.click(screen.getByRole("radio", { name: /Merge with what is here/ }));

    expect(onChooseRestoreMode).toHaveBeenCalledWith("merge");
  });

  it("shows the merge choice as the chosen one when it is", () => {
    setup({ restoreMode: "merge" });

    expect(screen.getByRole("radio", { name: /Merge with what is here/ })).toBeChecked();
  });

  it("asks for the passphrase of an encrypted file it has been handed", async () => {
    const user = userEvent.setup();
    const { onUnlock } = setup({ needsPassphrase: true });

    await user.type(screen.getByLabelText("This backup is encrypted"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Unlock and restore" }));

    expect(onUnlock).toHaveBeenCalledWith("correct horse");
  });

  it("reports what happened where it can be read", () => {
    setup({ status: { kind: "error", message: "That file is not valid JSON." } });

    expect(screen.getByRole("status")).toHaveTextContent("That file is not valid JSON.");
  });

  it("disables everything while it is working", () => {
    setup({ status: { kind: "working" } });

    expect(screen.getByRole("button", { name: /Download backup/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Merge with what is here/ })).toBeDisabled();
  });
});
