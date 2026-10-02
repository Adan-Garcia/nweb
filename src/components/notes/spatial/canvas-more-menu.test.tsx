import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { type CanvasMoreActions, CanvasMoreMenu } from "./canvas-more-menu";

function renderMenu(overrides: Partial<CanvasMoreActions> = {}) {
  const actions: CanvasMoreActions = {
    onFit: vi.fn(),
    onImportPdf: vi.fn(),
    isImportingPdf: false,
    onExportPng: vi.fn(),
    onExportPdf: vi.fn(),
    isExporting: false,
    input: { settings: { fingerDraws: "auto", stylusOnly: false }, update: vi.fn() },
    isReadOnly: false,
    ...overrides,
  };
  const onDone = vi.fn();
  render(<CanvasMoreMenu actions={actions} onDone={onDone} />);

  return { actions, onDone, user: userEvent.setup() };
}

describe("CanvasMoreMenu", () => {
  it("runs what is picked and closes", async () => {
    const { actions, onDone, user } = renderMenu();

    await user.click(screen.getByRole("button", { name: "Zoom to fit" }));
    await user.click(screen.getByRole("button", { name: "Export as PNG" }));
    await user.click(screen.getByRole("button", { name: "Export as PDF" }));

    expect(actions.onFit).toHaveBeenCalled();
    expect(actions.onExportPng).toHaveBeenCalled();
    expect(actions.onExportPdf).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(3);
  });

  it("offers a paged note its pages, and a phone fullscreen", async () => {
    const pages = { isShown: true, onToggle: vi.fn(), onAdd: vi.fn() };
    const onToggleFullscreen = vi.fn();
    const { user } = renderMenu({ pages, onToggleFullscreen });

    expect(screen.getByRole("button", { name: "Page thumbnails" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Page thumbnails" }));
    await user.click(screen.getByRole("button", { name: "Add page" }));
    await user.click(screen.getByRole("button", { name: "Full screen" }));

    expect(pages.onToggle).toHaveBeenCalled();
    expect(pages.onAdd).toHaveBeenCalled();
    expect(onToggleFullscreen).toHaveBeenCalled();
  });

  it("holds import and export while they run", () => {
    renderMenu({ isImportingPdf: true, isExporting: true });

    expect(screen.getByRole("button", { name: "Importing PDF…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export as PNG" })).toBeDisabled();
  });

  it("turns finger drawing and stylus-only on and off for this device", async () => {
    const update = vi.fn();
    const { user } = renderMenu({
      input: { settings: { fingerDraws: true, stylusOnly: true }, update },
    });

    await user.click(screen.getByRole("checkbox", { name: /Draw with finger/ }));
    await user.click(screen.getByRole("checkbox", { name: /Stylus only/ }));

    expect(update).toHaveBeenCalledWith({ fingerDraws: "auto" });
    expect(update).toHaveBeenCalledWith({ stylusOnly: false });
  });

  it("lets fingers draw when ticked", async () => {
    const update = vi.fn();
    const { user } = renderMenu({
      input: { settings: { fingerDraws: "auto", stylusOnly: false }, update },
    });

    await user.click(screen.getByRole("checkbox", { name: /Draw with finger/ }));

    expect(update).toHaveBeenCalledWith({ fingerDraws: true });
  });
});
