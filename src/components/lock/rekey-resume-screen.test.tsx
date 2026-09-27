import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RekeyResumeScreen } from "./rekey-resume-screen";

function setup(overrides: Partial<Parameters<typeof RekeyResumeScreen>[0]> = {}) {
  const props = {
    needed: ["target"] as ("source" | "target")[],
    error: null,
    isWorking: false,
    progress: null,
    onResume: vi.fn(),
    ...overrides,
  };

  render(<RekeyResumeScreen {...props} />);
  return props;
}

describe("RekeyResumeScreen", () => {
  it("says what happened and that nothing is lost", () => {
    setup();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Finish encrypting this workspace/,
    );
    expect(screen.getByText(/Nothing is lost/)).toBeVisible();
  });

  it("asks for one passphrase when only one side has a key", async () => {
    const user = userEvent.setup();
    const { onResume } = setup({ needed: ["target"] });

    expect(screen.queryByLabelText(/moving from/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/moving to/), "correct horse");
    await user.click(screen.getByRole("button", { name: "Finish the change" }));

    expect(onResume).toHaveBeenCalledWith({ source: undefined, target: "correct horse" });
  });

  it("asks for both when a change between two passphrases was interrupted", async () => {
    const user = userEvent.setup();
    const { onResume } = setup({ needed: ["source", "target"] });

    await user.type(screen.getByLabelText(/moving from/), "old one");
    await user.type(screen.getByLabelText(/moving to/), "new one");
    await user.click(screen.getByRole("button", { name: "Finish the change" }));

    expect(onResume).toHaveBeenCalledWith({ source: "old one", target: "new one" });
  });

  it("will not submit until every passphrase it needs is there", async () => {
    const user = userEvent.setup();
    const { onResume } = setup({ needed: ["source", "target"] });

    await user.type(screen.getByLabelText(/moving from/), "old one");

    expect(screen.getByRole("button", { name: "Finish the change" })).toBeDisabled();
    expect(onResume).not.toHaveBeenCalled();
  });

  it("shows how far it has got, rather than an unexplained wait", () => {
    setup({ isWorking: true, progress: { done: 40, total: 200 } });

    const bar = screen.getByRole("progressbar", { name: "Finishing" });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuemax", "200");
    expect(screen.getByText(/Finishing: 40 of 200 rows/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Finishing..." })).toBeDisabled();
  });

  it("shows a wrong passphrase where it can be read", () => {
    setup({ error: "That is not the passphrase." });

    expect(screen.getByRole("alert")).toHaveTextContent("That is not the passphrase.");
  });
});
