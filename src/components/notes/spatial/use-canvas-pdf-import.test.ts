import { act, renderHook, waitFor } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const renderPdfPagesToPng = vi.fn();
vi.mock("./spatial-notes-pdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./spatial-notes-pdf")>()),
  renderPdfPagesToPng: (file: File) => renderPdfPagesToPng(file) as unknown,
}));

const notifyError = vi.fn<(message: string) => void>();
const notifySuccess = vi.fn<(message: string) => void>();
vi.mock("@/lib/toast", () => ({
  notifyError: (message: string) => notifyError(message),
  notifySuccess: (message: string) => notifySuccess(message),
}));

import { createScene, type SceneLayout } from "@/lib/canvas/scene-model";

import { useCanvasCamera } from "./use-canvas-camera";
import { useCanvasPdfImport } from "./use-canvas-pdf-import";
import { useCanvasScene } from "./use-canvas-scene";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const page = (pageNumber: number, totalPages: number) => ({
  dataUrl: PNG,
  width: 612,
  height: 792,
  pageNumber,
  totalPages,
});

function setup(layout: SceneLayout = "infinite", pageless = false) {
  const scene = pageless ? { ...createScene("paged"), elements: [] } : createScene(layout);
  return renderHook(() => {
    const sceneState = useCanvasScene({ scene, files: new Map() }, vi.fn());
    const camera = useCanvasCamera({ current: null }, null);
    return { sceneState, pdf: useCanvasPdfImport(sceneState, camera) };
  });
}

/** What a file input's change looks like to the handler: the chosen file, and a value to clear. */
function choose(file: File | undefined) {
  const input = document.createElement("input");
  Object.defineProperty(input, "files", { value: file ? [file] : [] });
  // The handler reads `currentTarget` only; a real event would carry the input there too.
  return { currentTarget: input } as ChangeEvent<HTMLInputElement>;
}

const pdf = new File(["%PDF"], "notes.pdf", { type: "application/pdf" });

beforeEach(() => {
  renderPdfPagesToPng.mockReset();
  notifyError.mockReset();
  notifySuccess.mockReset();
});

describe("useCanvasPdfImport", () => {
  it("places the chosen pages as images on an infinite canvas, and says which", async () => {
    renderPdfPagesToPng.mockResolvedValue([page(2, 5), page(3, 5)]);
    const { result } = setup();

    act(() => result.current.pdf.onInputChange(choose(pdf)));

    await waitFor(() => expect(result.current.sceneState.scene.elements).toHaveLength(2));
    expect(
      result.current.sceneState.scene.elements.every((element) => element.type === "image"),
    ).toBe(true);
    expect(result.current.sceneState.files.size).toBe(2);
    expect(notifySuccess).toHaveBeenCalledWith("Inserted 2 pages (2-3).");
    expect(result.current.pdf.isImporting).toBe(false);
  });

  it("adds the pages as note pages to write over in a paged note, without a word for one", async () => {
    renderPdfPagesToPng.mockResolvedValue([page(1, 1)]);
    const { result } = setup("paged");

    act(() => result.current.pdf.onInputChange(choose(new File(["%PDF"], "SCAN.PDF"))));

    await waitFor(() => expect(result.current.sceneState.scene.elements).toHaveLength(2));
    const [, added] = result.current.sceneState.scene.elements;
    expect(added.type === "page" && added.pdf?.fileId).toEqual(expect.any(String));
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it("starts the stack of a paged note that has no pages left", async () => {
    renderPdfPagesToPng.mockResolvedValue([page(1, 1)]);
    const { result } = setup("paged", true);

    act(() => result.current.pdf.onInputChange(choose(pdf)));

    await waitFor(() => expect(result.current.sceneState.scene.elements).toHaveLength(1));
    expect(result.current.sceneState.scene.elements[0].type).toBe("page");
  });

  it("rejects a file that is not a PDF, and does nothing when the picker is cancelled", async () => {
    const { result } = setup();

    act(() =>
      result.current.pdf.onInputChange(choose(new File(["x"], "photo.png", { type: "image/png" }))),
    );
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("Please choose a PDF file."));

    act(() => result.current.pdf.onInputChange(choose(undefined)));
    expect(renderPdfPagesToPng).not.toHaveBeenCalled();
  });

  it("adds nothing when the page prompt is dismissed", async () => {
    renderPdfPagesToPng.mockResolvedValue(null);
    const { result } = setup();

    act(() => result.current.pdf.onInputChange(choose(pdf)));

    await waitFor(() => expect(renderPdfPagesToPng).toHaveBeenCalled());
    await waitFor(() => expect(result.current.pdf.isImporting).toBe(false));
    expect(result.current.sceneState.scene.elements).toEqual([]);
  });

  it("reports a PDF that will not render", async () => {
    renderPdfPagesToPng.mockRejectedValue(new Error("bad selection"));
    const { result } = setup();

    act(() => result.current.pdf.onInputChange(choose(pdf)));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(expect.stringMatching(/Could not import PDF/)),
    );
  });

  it("opens the hidden file input", () => {
    const { result } = setup();
    const input = document.createElement("input");
    const click = vi.spyOn(input, "click");
    result.current.pdf.inputRef.current = input;

    act(() => result.current.pdf.openPicker());

    expect(click).toHaveBeenCalledOnce();
  });
});
