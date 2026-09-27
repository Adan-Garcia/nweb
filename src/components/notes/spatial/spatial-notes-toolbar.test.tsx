import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SpatialNotesToolbar } from "./spatial-notes-toolbar";

function setup(overrides: Partial<Parameters<typeof SpatialNotesToolbar>[0]> = {}) {
  const props = {
    penWidth: 2.5,
    isImportingPdf: false,
    isFullscreen: false,
    minPenWidth: 0.5,
    maxPenWidth: 8,
    penWidthStep: 0.25,
    onPenWidthChange: vi.fn(),
    onUploadPdf: vi.fn(),
    onToggleFullscreen: vi.fn(),
    ...overrides,
  };
  render(<SpatialNotesToolbar {...props} />);
  return props;
}

describe("SpatialNotesToolbar", () => {
  it("shows the pen width to two decimals on a slider with the given range", () => {
    setup();
    const slider = screen.getByRole("slider", { name: "Pen width" });

    expect(screen.getByText("Pen 2.50")).toBeInTheDocument();
    expect(slider).toHaveValue("2.5");
    expect(slider).toHaveAttribute("min", "0.5");
    expect(slider).toHaveAttribute("max", "8");
    expect(slider).toHaveAttribute("step", "0.25");
  });

  it("reports a new pen width as a number", () => {
    const { onPenWidthChange } = setup({ penWidth: 2 });

    fireEvent.change(screen.getByRole("slider", { name: "Pen width" }), {
      target: { value: "3.5" },
    });

    expect(onPenWidthChange).toHaveBeenCalledWith(3.5);
  });

  it("starts a PDF import", async () => {
    const user = userEvent.setup();
    const { onUploadPdf } = setup();

    await user.click(screen.getByRole("button", { name: "Insert PDF" }));

    expect(onUploadPdf).toHaveBeenCalledOnce();
  });

  it("shows progress and blocks a second import while importing", () => {
    setup({ isImportingPdf: true });
    expect(screen.getByRole("button", { name: "Importing PDF..." })).toBeDisabled();
  });

  it("toggles fullscreen, labelling the button for what it would do", async () => {
    const user = userEvent.setup();
    const { onToggleFullscreen } = setup();

    await user.click(screen.getByRole("button", { name: "Enter canvas fullscreen" }));
    expect(onToggleFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByText("Full Screen")).toBeInTheDocument();
  });

  it("offers to exit when already fullscreen", () => {
    setup({ isFullscreen: true });
    expect(screen.getByRole("button", { name: "Exit canvas fullscreen" })).toBeInTheDocument();
    expect(screen.getByText("Exit Full Screen")).toBeInTheDocument();
  });
});
