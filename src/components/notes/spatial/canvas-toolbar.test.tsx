import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasToolbar } from "./canvas-toolbar";
import type { CanvasTools } from "./use-canvas-tools";

const tools: CanvasTools = {
  tool: "pen",
  setTool: vi.fn(),
  style: { color: "ink-black", width: 2, shapeKind: "rectangle", fill: null },
  setColor: vi.fn(),
  setWidth: vi.fn(),
  shapeKind: "rectangle",
  setShapeKind: vi.fn(),
};

function renderToolbar(overrides: Partial<Parameters<typeof CanvasToolbar>[0]> = {}) {
  render(
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
      onColorPicked={vi.fn()}
      {...overrides}
    />,
  );
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
});
