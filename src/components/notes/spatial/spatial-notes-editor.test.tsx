import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SpatialSnapshot } from "@/components/notes/types";
import { createScene } from "@/lib/canvas/scene-model";

import { SpatialNotesEditor } from "./spatial-notes-editor";

// jsdom has no 2D canvas; drawing is covered by the renderer's own tests and the E2E suite.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function renderEditor(layout: "infinite" | "paged" = "infinite", isReadOnly = false) {
  const onChange = vi.fn<(snapshot: SpatialSnapshot) => void>();
  render(
    <SpatialNotesEditor
      initialData={{ status: "ready", scene: createScene(layout), files: new Map() }}
      onChange={onChange}
      optimizeImage={vi.fn()}
      isReadOnly={isReadOnly}
    />,
  );
  const lastScene = () => onChange.mock.lastCall?.[0].scene;

  return { onChange, lastScene };
}

const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("SpatialNotesEditor", () => {
  it.each([
    ["newer-format", /saved by a newer version/],
    ["invalid", /format this version does not read/],
  ] as const)("says why a %s drawing cannot be opened, and offers no tools", (reason, message) => {
    render(
      <SpatialNotesEditor
        initialData={{ status: "unreadable", reason }}
        onChange={vi.fn()}
        optimizeImage={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("starts with the pen and switches tools, cycling the eraser and the shape", async () => {
    const user = userEvent.setup();
    renderEditor();
    expect(pressed("Pen")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Highlighter" }));
    expect(pressed("Highlighter")).toBe("true");
    expect(pressed("Pen")).toBe("false");

    await user.click(screen.getByRole("button", { name: "Stroke eraser" }));
    expect(pressed("Stroke eraser")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Stroke eraser" }));
    expect(pressed("Pixel eraser")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Shape: rectangle" }));
    expect(pressed("Shape: rectangle")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Shape: rectangle" }));
    expect(pressed("Shape: ellipse")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Lasso" }));
    expect(pressed("Lasso")).toBe("true");
  });

  it("keeps a colour and a width for each kind of mark", async () => {
    const user = userEvent.setup();
    renderEditor();
    const colours = within(screen.getByRole("group", { name: "Colour" }));

    await user.click(colours.getByRole("button", { name: "Blue" }));
    expect(colours.getByRole("button", { name: "Blue" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Pen settings" }));
    const width = () => screen.getByRole("slider", { name: "Width" });
    // A range input takes no typing; set it the way a drag would.
    fireEvent.change(width(), { target: { value: "6" } });
    expect(width()).toHaveValue("6");

    await user.click(screen.getByRole("button", { name: "Highlighter" }));
    expect(colours.getByRole("button", { name: "Yellow" })).toHaveAttribute("aria-pressed", "true");
    expect(width()).toHaveValue("16");

    await user.click(screen.getByRole("button", { name: "Pen" }));
    expect(colours.getByRole("button", { name: "Blue" })).toHaveAttribute("aria-pressed", "true");
    expect(width()).toHaveValue("6");
  });

  it("adds a page to a paged note, and undoes and redoes it", async () => {
    const user = userEvent.setup();
    const { onChange, lastScene } = renderEditor("paged");
    const pageCount = () =>
      lastScene()?.elements.filter((element) => element.type === "page").length;
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Add page" }));
    expect(pageCount()).toBe(2);
    expect(onChange.mock.lastCall?.[0].revision).toBe(1);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(pageCount()).toBe(1);
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(pageCount()).toBe(2);
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("recolours what the lasso selected when a colour is picked", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ width: 400, height: 300 }),
    );
    const { lastScene } = renderEditor();
    const canvas = screen.getByRole("img", { name: "Drawing canvas" });
    const press = (type: string, x: number, y: number) =>
      act(() => {
        fireEvent(
          canvas,
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: "pen",
            clientX: x,
            clientY: y,
            bubbles: true,
          }),
        );
      });

    press("pointerdown", 200, 150);
    press("pointermove", 240, 150);
    press("pointerup", 240, 150);
    await user.click(screen.getByRole("button", { name: "Lasso" }));
    for (const [type, x, y] of [
      ["pointerdown", 190, 140],
      ["pointermove", 250, 140],
      ["pointermove", 250, 160],
      ["pointermove", 190, 160],
      ["pointerup", 190, 160],
    ] as const) {
      press(type, x, y);
    }
    await user.click(screen.getByRole("button", { name: "Red" }));

    expect(lastScene()?.elements[0]).toMatchObject({ type: "stroke", color: "ink-red" });
  });

  it("offers no pages to add on an infinite canvas", () => {
    renderEditor("infinite");

    expect(screen.queryByRole("button", { name: "Add page" })).not.toBeInTheDocument();
  });

  it("offers nothing but fullscreen for a note shared to read", () => {
    renderEditor("infinite", true);

    expect(screen.queryByRole("group", { name: "Tools" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter canvas fullscreen" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Drawing (read only)" })).toBeInTheDocument();
  });

  it("answers single-key shortcuts while the canvas has focus", async () => {
    const user = userEvent.setup();
    renderEditor("paged");
    const host = screen.getByRole("img", { name: "Drawing canvas" }).parentElement;
    act(() => host?.focus());

    await user.keyboard("h");
    expect(pressed("Highlighter")).toBe("true");
    await user.keyboard("e");
    expect(pressed("Stroke eraser")).toBe("true");
    await user.keyboard("0");
    await user.click(screen.getByRole("button", { name: "Add page" }));
    act(() => host?.focus());
    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("puts the canvas into fullscreen from the toolbar", async () => {
    const user = userEvent.setup();
    const requestFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Enter canvas fullscreen" }));

    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it("opens the PDF picker from the toolbar", async () => {
    const user = userEvent.setup();
    renderEditor();
    const input = screen.getByLabelText("PDF to insert");
    const click = vi.spyOn(input, "click");

    await user.click(screen.getByRole("button", { name: "Insert PDF" }));

    expect(click).toHaveBeenCalledOnce();
  });
});
