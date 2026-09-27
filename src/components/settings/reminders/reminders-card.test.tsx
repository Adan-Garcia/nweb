import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RemindersCard } from "./reminders-card";

function setup(overrides: Partial<Parameters<typeof RemindersCard>[0]> = {}) {
  const props = {
    state: "off" as const,
    isWorking: false,
    onEnable: vi.fn(),
    onDisable: vi.fn(),
    ...overrides,
  };

  render(<RemindersCard {...props} />);

  return props;
}

describe("RemindersCard", () => {
  it("offers the switch when they are available and off", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("button", { name: "Turn on reminders" }));

    expect(props.onEnable).toHaveBeenCalled();
  });

  it("offers to turn them off again", async () => {
    const user = userEvent.setup();
    const props = setup({ state: "on" });

    await user.click(screen.getByRole("button", { name: "Turn off reminders" }));

    expect(props.onDisable).toHaveBeenCalled();
  });

  it("offers no switch when the deployment sends none, and says why", () => {
    setup({ state: "unavailable" });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/does not send reminders/i)).toBeInTheDocument();
  });

  it("offers no switch when the browser cannot show them", () => {
    setup({ state: "unsupported" });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/needs a service worker/i)).toBeInTheDocument();
  });

  it("says where to change a refusal back, since the browser will not ask again", () => {
    setup({ state: "denied" });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/next to the address bar/i)).toBeInTheDocument();
  });

  it("says nothing definite while it is still looking", () => {
    setup({ state: "loading" });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/Checking whether reminders are available/i)).toBeInTheDocument();
  });

  it("is plain that a reminder cannot say what is due", () => {
    setup({ state: "on" });

    // The copy is the feature as much as the switch is: promising more would be promising
    // something the encryption makes impossible.
    expect(screen.getByText(/Not what it is/)).toBeInTheDocument();
  });

  it("does not let the switch be pressed twice while it is working", () => {
    setup({ isWorking: true });

    expect(screen.getByRole("button", { name: "Turn on reminders" })).toBeDisabled();
  });
});
