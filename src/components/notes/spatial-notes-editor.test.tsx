import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const excalidraw = vi.hoisted(() => {
  const props: Record<string, unknown> = {};
  return {
    props,
    api: {
      getAppState: vi.fn(() => ({ currentItemStrokeWidth: 3 })),
      updateScene: vi.fn(),
      setToast: vi.fn(),
      onChange: vi.fn(() => vi.fn()),
    },
  };
});

// A stand-in that behaves like the real component where this editor touches it: it hands over its
// imperative API, renders the top-right UI slot, and renders its MainMenu children.
vi.mock("@excalidraw/excalidraw", async () => {
  const { useEffect } = await import("react");

  const MainMenu = Object.assign(({ children }: { children: ReactNode }) => <div>{children}</div>, {
    Item: ({ children, onSelect }: { children: ReactNode; onSelect: () => void }) => (
      <button type="button" onClick={onSelect}>
        {children}
      </button>
    ),
    Separator: () => <hr />,
    DefaultItems: {
      SaveAsImage: () => <span>Save as image</span>,
      ClearCanvas: () => <span>Clear canvas</span>,
    },
  });

  function Excalidraw(props: {
    theme: string;
    excalidrawAPI: (api: unknown) => void;
    renderTopRightUI: () => ReactNode;
    children: ReactNode;
  }) {
    Object.assign(excalidraw.props, props);
    const { excalidrawAPI } = props;
    useEffect(() => {
      excalidrawAPI(excalidraw.api);
    }, [excalidrawAPI]);

    return (
      <div data-testid="excalidraw" data-theme={props.theme}>
        {props.renderTopRightUI()}
        {props.children}
      </div>
    );
  }

  return { Excalidraw, MainMenu, convertToExcalidrawElements: vi.fn() };
});

import { SpatialNotesEditor } from "./spatial-notes-editor";

const requestFullscreen = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: requestFullscreen,
  });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
});

function setup(isDark = false) {
  const hostRef: { current: HTMLDivElement | null } = { current: null };
  const onChange = vi.fn();
  const onPaste = vi.fn();
  const view = render(
    <SpatialNotesEditor
      isDark={isDark}
      hostRef={hostRef}
      initialData={null}
      onChange={onChange}
      onPaste={onPaste}
    />,
  );
  return { hostRef, onChange, onPaste, ...view };
}

describe("SpatialNotesEditor", () => {
  it("passes the light or dark theme to the canvas", () => {
    const { unmount } = setup(false);
    expect(screen.getByTestId("excalidraw")).toHaveAttribute("data-theme", "light");
    unmount();

    setup(true);
    expect(screen.getByTestId("excalidraw")).toHaveAttribute("data-theme", "dark");
  });

  it("forwards change and paste handling to the canvas and exposes its host element", () => {
    const { hostRef, onChange, onPaste } = setup();

    expect(excalidraw.props.onChange).toBe(onChange);
    expect(excalidraw.props.onPaste).toBe(onPaste);
    expect(hostRef.current).toBeInstanceOf(HTMLDivElement);
  });

  it("only allows PDFs to be embedded", () => {
    setup();
    const validate = excalidraw.props.validateEmbeddable as (url: string) => boolean;

    expect(validate("https://example.com/a.pdf")).toBe(true);
    expect(validate("https://example.com/a.html")).toBe(false);
  });

  it("starts the pen toolbar at the width the canvas is using", () => {
    setup();
    expect(screen.getByText("Pen 3.00")).toBeInTheDocument();
  });

  it("pushes a new pen width to the canvas", () => {
    setup();

    fireEvent.change(screen.getByRole("slider", { name: "Pen width" }), { target: { value: "5" } });

    expect(excalidraw.api.updateScene).toHaveBeenLastCalledWith({
      appState: { currentItemStrokeWidth: 5 },
    });
    expect(screen.getByText("Pen 5.00")).toBeInTheDocument();
  });

  it("opens the file picker from both the toolbar and the canvas menu", async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLInputElement.prototype, "click");
    setup();

    await user.click(screen.getByRole("button", { name: "Insert PDF" }));
    await user.click(screen.getByRole("button", { name: "Insert PDF (choose pages)" }));

    expect(click).toHaveBeenCalledTimes(2);
    click.mockRestore();
  });

  it("offers the standard canvas menu items", () => {
    setup();
    expect(screen.getByText("Save as image")).toBeInTheDocument();
    expect(screen.getByText("Clear canvas")).toBeInTheDocument();
  });

  it("rejects a chosen file that is not a PDF", () => {
    const { container } = setup();
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error("file input not found");

    fireEvent.change(input, {
      target: { files: [new File(["x"], "photo.png", { type: "image/png" })] },
    });

    expect(excalidraw.api.setToast).toHaveBeenCalledWith({ message: "Please choose a PDF file." });
  });

  it("puts the canvas shell into fullscreen from the toolbar", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: "Enter canvas fullscreen" }));

    expect(requestFullscreen).toHaveBeenCalledOnce();
  });
});
