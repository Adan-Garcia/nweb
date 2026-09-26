import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SharingCard } from "./sharing-card";

const COURSE = {
  keyId: "branch-key",
  kind: "branch" as const,
  name: "Thermodynamics",
  within: null,
};
const NOTE = {
  keyId: "note-key",
  kind: "feather" as const,
  name: "Entropy",
  within: "Thermodynamics",
};

function setup(overrides: Partial<Parameters<typeof SharingCard>[0]> = {}) {
  const props = {
    isConnected: true,
    shareable: [COURSE, NOTE],
    shares: [],
    selected: null,
    error: null,
    isWorking: false,
    onSelect: vi.fn(),
    onShare: vi.fn(),
    onRevoke: vi.fn(),
    ...overrides,
  };

  render(<SharingCard {...props} />);

  return props;
}

describe("SharingCard", () => {
  it("says sharing needs an account, and offers nothing without one", () => {
    setup({ isConnected: false });

    expect(screen.getByText(/Sharing needs an account/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("lists a course and a note side by side, because either is shareable", () => {
    setup();

    // Sharing is not a level in the hierarchy: it is any object with a key of its own.
    expect(screen.getByRole("button", { name: /Course.*Thermodynamics/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Note.*Entropy/ })).toBeInTheDocument();
  });

  it("says so when nothing has a key yet", () => {
    setup({ shareable: [] });

    expect(screen.getByText(/Nothing here has a key of its own yet/i)).toBeInTheDocument();
  });

  it("picks a thing, and puts it back when picked again", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("button", { name: /Course.*Thermodynamics/ }));

    expect(props.onSelect).toHaveBeenCalledWith("branch-key");
  });

  it("deselects the one already chosen", async () => {
    const user = userEvent.setup();
    const props = setup({ selected: "branch-key" });

    await user.click(screen.getByRole("button", { name: /Course.*Thermodynamics/ }));

    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it("says what a course takes with it", () => {
    setup({ selected: "branch-key" });

    expect(screen.getByText(/Everything inside it comes too/i)).toBeInTheDocument();
  });

  it("says a note arrives with its path by name, and nothing else on it", () => {
    setup({ selected: "note-key" });

    expect(screen.getByText(/see where it lives/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing else in them/i)).toBeInTheDocument();
  });

  it("shares with an address and a role", async () => {
    const user = userEvent.setup();
    const props = setup({ selected: "branch-key" });

    await user.type(screen.getByLabelText("Share with"), "friend@example.com");
    await user.click(screen.getByRole("radio", { name: "Read and change it" }));
    await user.click(screen.getByRole("button", { name: "Share" }));

    expect(props.onShare).toHaveBeenCalledWith("branch-key", "friend@example.com", "writer");
  });

  it("defaults to reading only", async () => {
    const user = userEvent.setup();
    const props = setup({ selected: "branch-key" });

    await user.type(screen.getByLabelText("Share with"), "friend@example.com");
    await user.click(screen.getByRole("button", { name: "Share" }));

    expect(props.onShare).toHaveBeenCalledWith("branch-key", "friend@example.com", "reader");
  });

  it("will not share with something that is not an address", async () => {
    const user = userEvent.setup();
    const props = setup({ selected: "branch-key" });

    await user.type(screen.getByLabelText("Share with"), "not-an-address");

    expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
    expect(props.onShare).not.toHaveBeenCalled();
  });

  it("lists who holds it, and what they can do", () => {
    setup({
      selected: "branch-key",
      shares: [
        { email: "friend@example.com", role: "reader" },
        { email: "tutor@example.com", role: "writer" },
      ],
    });

    expect(screen.getByRole("combobox", { name: "What friend@example.com can do" })).toHaveValue(
      "reader",
    );
    expect(screen.getByRole("combobox", { name: "What tutor@example.com can do" })).toHaveValue(
      "writer",
    );
  });

  it("changes what someone can do by sharing again at the new role", async () => {
    const user = userEvent.setup();
    const props = setup({
      selected: "branch-key",
      shares: [{ email: "friend@example.com", role: "reader" }],
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "What friend@example.com can do" }),
      "Can change",
    );

    expect(props.onShare).toHaveBeenCalledWith("branch-key", "friend@example.com", "writer");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "What friend@example.com can do" }),
      "Can read",
    );

    expect(props.onShare).toHaveBeenLastCalledWith("branch-key", "friend@example.com", "reader");
  });

  it("says plainly when nobody else has it", () => {
    setup({ selected: "branch-key" });

    expect(screen.getByText("Nobody else has this.")).toBeInTheDocument();
  });

  it("takes it back from one person", async () => {
    const user = userEvent.setup();
    const props = setup({
      selected: "branch-key",
      shares: [{ email: "friend@example.com", role: "reader" }],
    });

    await user.click(screen.getByRole("button", { name: "Remove friend@example.com" }));

    expect(props.onRevoke).toHaveBeenCalledWith("branch-key", "friend@example.com");
  });

  it("is plain that removing someone cannot unsee what they read", () => {
    setup({ selected: "branch-key" });

    // The maths does not make that promise, so the card must not either.
    expect(screen.getByText(/cannot unsee what they already read/i)).toBeInTheDocument();
  });

  it("reports a failure where a screen reader will hear it", () => {
    setup({ error: "Nobody with that address can be shared with." });

    expect(screen.getByRole("alert")).toHaveTextContent("Nobody with that address");
  });
});
