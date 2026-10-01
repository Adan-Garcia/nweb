import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MAX_PEN_PRESETS } from "@/lib/canvas/pen-settings";
import { usePreferencesStore } from "@/stores/use-preferences-store";

import { CanvasToolbar } from "./canvas-toolbar";
import { type CanvasTools, useCanvasTools } from "./use-canvas-tools";

type ToolbarProps = Parameters<typeof CanvasToolbar>[0];

/** The toolbar on the real tools hook, so what it changes shows up in what it renders. */
function Harness({
  overrides,
  onTools,
}: {
  overrides: Partial<ToolbarProps>;
  onTools: (tools: CanvasTools) => void;
}) {
  const tools = useCanvasTools();
  onTools(tools);

  return (
    <CanvasToolbar
      tools={tools}
      isReadOnly={false}
      canUndo={false}
      canRedo={false}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onImportPdf={vi.fn()}
      isImportingPdf={false}
      isFullscreen={false}
      onToggleFullscreen={vi.fn()}
      onColorPicked={tools.setColor}
      {...overrides}
    />
  );
}

function renderToolbar(overrides: Partial<ToolbarProps> = {}) {
  const latest: { tools: CanvasTools | null } = { tools: null };
  render(<Harness overrides={overrides} onTools={(tools) => (latest.tools = tools)} />);

  return {
    user: userEvent.setup(),
    style: () => latest.tools?.style,
  };
}

/** Sets a range input the way a drag would leave it: it takes no typing. */
function slide(name: string, value: number) {
  fireEvent.change(screen.getByRole("slider", { name }), { target: { value: String(value) } });
}

describe("CanvasToolbar", () => {
  it("says a PDF is importing, and holds the button until it has", () => {
    renderToolbar({ isImportingPdf: true });

    expect(screen.getByRole("button", { name: "Importing PDF…" })).toBeDisabled();
  });

  it("offers the way out of fullscreen while in it", () => {
    renderToolbar({ isFullscreen: true });

    expect(screen.getByRole("button", { name: "Exit canvas fullscreen" })).toBeInTheDocument();
  });

  it("sets the pen's width, pressure and the smoothing from its settings, and Escape closes them", async () => {
    const { user, style } = renderToolbar();

    await user.click(screen.getByRole("button", { name: "Pen settings" }));
    slide("Width", 6);
    slide("Pressure", 0.8);
    slide("Smoothing", 0.25);

    expect(style()).toMatchObject({ width: 6, sensitivity: 0.8 });
    expect(usePreferencesStore.getState().preferences.penSmoothing).toBe(0.25);
    expect(screen.getByText("80%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Highlighter" }));
    // The highlighter ignores pressure, so it has no such setting.
    expect(screen.queryByRole("slider", { name: "Pressure" })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Pen settings" })).not.toBeInTheDocument();
  });

  it("takes any colour from the picker, kept as it is", () => {
    const { style } = renderToolbar();
    const picker = screen.getByLabelText("Custom colour");

    // A colour input takes no typing either.
    fireEvent.change(picker, { target: { value: "#AB12CD" } });

    expect(style()?.color).toBe("#ab12cd");
  });

  it("saves a pen as a preset, switches back to it in one tap, and removes it", async () => {
    const { user, style } = renderToolbar();

    await user.click(screen.getByRole("button", { name: "Blue" }));
    await user.click(screen.getByRole("button", { name: "Pen settings" }));
    slide("Width", 4);
    await user.click(screen.getByRole("button", { name: "Save as preset" }));

    const preset = screen.getByRole("button", { name: "Pen: Blue, 4 px" });
    expect(preset).toHaveAttribute("aria-pressed", "true");
    // The same pen twice would be two buttons doing one thing.
    expect(screen.getByRole("button", { name: "Save as preset" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Highlighter" }));
    await user.click(preset);
    expect(style()).toMatchObject({ color: "ink-blue", width: 4 });
    expect(screen.getByRole("button", { name: "Pen" })).toHaveAttribute("aria-pressed", "true");

    const saved = screen.getByRole("list", { name: "Saved presets" });
    await user.click(within(saved).getByRole("button", { name: "Remove Pen: Blue, 4 px" }));
    expect(screen.queryByRole("group", { name: "Pen presets" })).not.toBeInTheDocument();
  });

  it("keeps no more presets than fit, and saves none for a tool that is not a pen", async () => {
    usePreferencesStore.getState().update({
      penPresets: Array.from({ length: MAX_PEN_PRESETS }, (_, i) => ({
        id: `p${i}`,
        tool: "pen" as const,
        color: "ink-red" as const,
        width: i + 10,
        sensitivity: 0.5,
      })),
    });
    const { user } = renderToolbar();

    await user.click(screen.getByRole("button", { name: "Pen settings" }));
    expect(screen.getByRole("button", { name: "Save as preset" })).toBeDisabled();

    usePreferencesStore.getState().update({ penPresets: [] });
    await user.click(screen.getByRole("button", { name: "Lasso" }));
    expect(screen.getByRole("button", { name: "Save as preset" })).toBeDisabled();
  });
});
