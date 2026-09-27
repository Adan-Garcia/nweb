import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SignupForm } from "./signup-form";

async function fill(user: ReturnType<typeof userEvent.setup>, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    await user.type(screen.getByLabelText(label), value);
  }
}

const valid = {
  Name: "Ada Lovelace",
  Email: "ada@example.com",
  Passphrase: "correct-horse",
  "Confirm passphrase": "correct-horse",
};

function setup(overrides: Partial<Parameters<typeof SignupForm>[0]> = {}) {
  const props = {
    hasPassphrase: false,
    defaultServerUrl: "",
    isWorking: false,
    progress: null,
    error: null,
    onSubmit: vi.fn(),
    ...overrides,
  };

  render(<SignupForm {...props} />);

  return { user: userEvent.setup(), onSubmit: props.onSubmit };
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Create account" }));

describe("SignupForm", () => {
  it("asks for every field when submitted empty", async () => {
    const { user, onSubmit } = setup();

    await submit(user);

    expect(await screen.findByText("Enter your name")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Use at least 8 characters")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires the two passphrases to match", async () => {
    const { user } = setup();

    await fill(user, { ...valid, "Confirm passphrase": "something-else" });
    await submit(user);

    expect(await screen.findByText("The passphrases do not match")).toBeInTheDocument();
  });

  it("asks a device that already has a passphrase for it once, with no length rule", async () => {
    const { user, onSubmit } = setup({ hasPassphrase: true });

    expect(screen.queryByLabelText("Confirm passphrase")).not.toBeInTheDocument();
    await fill(user, { Name: "Ada", Email: "ada@example.com", "This device's passphrase": "old" });
    await submit(user);

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ passphrase: "old" }),
        expect.anything(),
      ),
    );
  });

  it("asks for a server's address only when a sync account is wanted", async () => {
    const { user, onSubmit } = setup();

    expect(screen.queryByLabelText("Server address")).not.toBeInTheDocument();
    await fill(user, valid);
    await user.click(screen.getByRole("checkbox", { name: /sync account/ }));
    await submit(user);

    expect(await screen.findByText(/Enter the server's address/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Server address"), "https://sync.example.org");
    await submit(user);

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ withServer: true, serverUrl: "https://sync.example.org" }),
        expect.anything(),
      ),
    );
  });

  it("hands a valid form over without logging what was typed", async () => {
    const spies = (["log", "info", "debug", "warn"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const { user, onSubmit } = setup();

    await fill(user, valid);
    await submit(user);

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("shows what went wrong, and holds the button while it works", () => {
    setup({ error: "That is not the passphrase.", isWorking: true });

    expect(screen.getByRole("alert")).toHaveTextContent("That is not the passphrase.");
    expect(screen.getByRole("button", { name: "Setting up…" })).toBeDisabled();
  });
});
