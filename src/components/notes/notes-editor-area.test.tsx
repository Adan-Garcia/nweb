import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

// The real editors are heavy (TipTap, Excalidraw); these stand-ins record what they were given.
vi.mock("@/components/notes/linear/linear-notes-editor", () => ({
  LinearNotesEditor: ({ value, isReadOnly }: { value: string; isReadOnly?: boolean }) => (
    <div data-testid="linear-editor" data-read-only={String(Boolean(isReadOnly))}>
      {value}
    </div>
  ),
}));
vi.mock("@/components/notes/spatial/spatial-notes-editor", () => ({
  SpatialNotesEditor: ({ isDark, isReadOnly }: { isDark: boolean; isReadOnly?: boolean }) => (
    <div
      data-testid="spatial-editor"
      data-dark={String(isDark)}
      data-read-only={String(Boolean(isReadOnly))}
    />
  ),
}));

import { NotesEditorArea } from "./notes-editor-area";

type Workspace = ComponentProps<typeof NotesEditorArea>["workspace"];

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    mode: "linear",
    linearContent: "<p>hello</p>",
    setLinearContent: vi.fn(),
    isSpatialEditorReloading: false,
    activeDocumentId: "doc-1",
    spatialEditorReloadKey: 0,
    spatialHostRef: { current: null },
    spatialInitialData: null,
    handleSpatialChange: vi.fn(),
    handleSpatialPaste: vi.fn(),
    ...overrides,
  };
}

describe("NotesEditorArea", () => {
  it("shows the linear editor with the note's content in linear mode", () => {
    render(<NotesEditorArea workspace={workspace()} isDark={false} />);

    expect(screen.getByTestId("linear-editor")).toHaveTextContent("<p>hello</p>");
    expect(screen.queryByTestId("spatial-editor")).not.toBeInTheDocument();
  });

  it("shows the spatial editor in spatial mode, passing the theme", () => {
    render(<NotesEditorArea workspace={workspace({ mode: "spatial" })} isDark />);

    expect(screen.getByTestId("spatial-editor")).toHaveAttribute("data-dark", "true");
    expect(screen.queryByTestId("linear-editor")).not.toBeInTheDocument();
  });

  it("shows a placeholder, not the canvas, while the spatial editor reloads", () => {
    render(
      <NotesEditorArea
        workspace={workspace({ mode: "spatial", isSpatialEditorReloading: true })}
        isDark={false}
      />,
    );

    expect(screen.getByText("Reloading spatial note...")).toBeInTheDocument();
    expect(screen.queryByTestId("spatial-editor")).not.toBeInTheDocument();
  });

  it("remounts the canvas when the note or the reload key changes", () => {
    const { rerender } = render(
      <NotesEditorArea workspace={workspace({ mode: "spatial" })} isDark={false} />,
    );
    const first = screen.getByTestId("spatial-editor");

    rerender(<NotesEditorArea workspace={workspace({ mode: "spatial" })} isDark={false} />);
    expect(screen.getByTestId("spatial-editor")).toBe(first);

    rerender(
      <NotesEditorArea
        workspace={workspace({ mode: "spatial", spatialEditorReloadKey: 1 })}
        isDark={false}
      />,
    );
    expect(screen.getByTestId("spatial-editor")).not.toBe(first);
  });

  it("says a note is shared to read, and hands either editor the read-only flag", () => {
    const { rerender } = render(
      <NotesEditorArea workspace={workspace()} isDark={false} isReadOnly />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/Shared with you to read/);
    expect(screen.getByTestId("linear-editor")).toHaveAttribute("data-read-only", "true");

    rerender(
      <NotesEditorArea workspace={workspace({ mode: "spatial" })} isDark={false} isReadOnly />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/Shared with you to read/);
    expect(screen.getByTestId("spatial-editor")).toHaveAttribute("data-read-only", "true");
  });

  it("says nothing about access for a note this account may change", () => {
    render(<NotesEditorArea workspace={workspace()} isDark={false} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("linear-editor")).toHaveAttribute("data-read-only", "false");
  });
});
