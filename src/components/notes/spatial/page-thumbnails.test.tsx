import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { layoutPages } from "@/lib/canvas/pages";
import { createPage, type Scene, type Stroke } from "@/lib/canvas/scene-model";
import { stubCanvasDrawing } from "@/test/canvas-context";

import { PageThumbnails } from "./page-thumbnails";
import type { CanvasPages } from "./use-canvas-pages";

const ink = (id: string, pageId: string, version = 1): Stroke => ({
  id,
  version,
  index: "a5",
  type: "stroke",
  tool: "pen",
  color: "ink-black",
  width: 2,
  x: 10,
  y: 10,
  pageId,
  samples: [0, 0, 0.5, 0, 0, 0, 20, 20, 0.5, 0, 0, 8],
});

const sheets = [createPage("a0", "p1"), createPage("a1", "p2")];

function pagesOf(): CanvasPages {
  return {
    pages: layoutPages(sheets),
    currentId: "p1",
    goTo: vi.fn(),
    add: vi.fn(),
    move: vi.fn(),
    remove: vi.fn(),
  };
}

describe("PageThumbnails", () => {
  it("redraws a page's thumbnail only when what is on that page changes", () => {
    const { context } = stubCanvasDrawing();
    const scene: Scene = { format: 1, layout: "paged", elements: [...sheets, ink("a", "p1")] };
    const pages = pagesOf();
    const { rerender } = render(
      <PageThumbnails scene={scene} pages={pages} images={new Map()} isReadOnly={false} />,
    );
    const drawn = () => (context.clearRect ? vi.mocked(context.clearRect).mock.calls.length : 0);
    expect(drawn()).toBe(2);

    const onSecond = { ...scene, elements: [...scene.elements, ink("b", "p2")] };
    rerender(
      <PageThumbnails scene={onSecond} pages={pages} images={new Map()} isReadOnly={false} />,
    );
    expect(drawn()).toBe(3);

    rerender(
      <PageThumbnails
        scene={{ ...onSecond }}
        pages={pages}
        images={new Map()}
        isReadOnly={false}
      />,
    );
    expect(drawn()).toBe(3);
  });

  it("shows a note shared to read its pages, and nothing to change them with", () => {
    stubCanvasDrawing();
    const scene: Scene = { format: 1, layout: "paged", elements: sheets };
    render(<PageThumbnails scene={scene} pages={pagesOf()} images={new Map()} isReadOnly />);

    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "Delete page" })).not.toBeInTheDocument();
  });
});
