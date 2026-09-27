import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RenderedPdfPage } from "./spatial-notes-pdf";

const renderPdfPagesToPng = vi.fn<(file: File) => Promise<RenderedPdfPage[] | null>>();

vi.mock("./spatial-notes-pdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./spatial-notes-pdf")>()),
  renderPdfPagesToPng: (file: File) => renderPdfPagesToPng(file),
}));
vi.mock("@excalidraw/excalidraw", () => ({
  convertToExcalidrawElements: (skeletons: { fileId: string }[]) =>
    skeletons.map((skeleton, index) => ({ id: `element-${index}`, fileId: skeleton.fileId })),
}));

import { usePdfImport } from "./use-pdf-import";

type SceneUpdate = { elements: unknown[]; appState: { selectedElementIds: Record<string, true> } };

function fakeApi() {
  const calls = {
    addFiles: vi.fn(),
    updateScene: vi.fn<(scene: SceneUpdate) => void>(),
    setToast: vi.fn(),
  };
  const api = {
    ...calls,
    getAppState: vi.fn(() => ({ scrollX: 0, scrollY: 0, width: 1000, height: 800 })),
    getSceneElementsIncludingDeleted: vi.fn(() => [{ id: "existing" }]),
  } as unknown as ExcalidrawImperativeAPI;
  return { api, ...calls };
}

const pdf = () => new File(["%PDF"], "notes.pdf", { type: "application/pdf" });
const page = (pageNumber: number, totalPages: number): RenderedPdfPage => ({
  dataUrl: `data:image/png;base64,${pageNumber}`,
  width: 400,
  height: 600,
  pageNumber,
  totalPages,
});

beforeEach(() => {
  renderPdfPagesToPng.mockClear();
});

function setup() {
  const fake = fakeApi();
  const ref = { current: fake.api as ExcalidrawImperativeAPI | null };
  const hook = renderHook(() => usePdfImport(ref));
  return { ...fake, ref, ...hook };
}

function changeEvent(file: File | undefined) {
  const input = document.createElement("input");
  Object.defineProperty(input, "files", { value: file ? [file] : [] });
  return { currentTarget: input } as unknown as ChangeEvent<HTMLInputElement>;
}

describe("usePdfImport", () => {
  it("inserts every rendered page as an image, selects them, and reports what happened", async () => {
    renderPdfPagesToPng.mockResolvedValue([page(1, 3), page(2, 3)]);
    const { result, addFiles, updateScene, setToast } = setup();

    await act(() => {
      result.current.handlePdfInputChange(changeEvent(pdf()));
      return Promise.resolve();
    });

    await waitFor(() =>
      expect(setToast).toHaveBeenCalledWith({ message: "Inserted 2 pages (1-2)." }),
    );
    expect(addFiles).toHaveBeenCalledWith([
      expect.objectContaining({ mimeType: "image/png", dataURL: "data:image/png;base64,1" }),
      expect.objectContaining({ mimeType: "image/png", dataURL: "data:image/png;base64,2" }),
    ]);
    const scene = updateScene.mock.calls[0][0];
    expect(scene.elements).toHaveLength(3); // one existing + two pages
    expect(scene.appState.selectedElementIds).toEqual({ "element-0": true, "element-1": true });
    expect(result.current.isImportingPdf).toBe(false);
  });

  it("rejects files that are not PDFs without rendering", async () => {
    const { result, setToast } = setup();

    await act(() => {
      result.current.handlePdfInputChange(
        changeEvent(new File(["x"], "photo.png", { type: "image/png" })),
      );
      return Promise.resolve();
    });

    expect(setToast).toHaveBeenCalledWith({ message: "Please choose a PDF file." });
    expect(renderPdfPagesToPng).not.toHaveBeenCalled();
  });

  it("accepts a .pdf name even when the browser gives no mime type", async () => {
    renderPdfPagesToPng.mockResolvedValue([page(1, 1)]);
    const { result, addFiles } = setup();

    await act(() => {
      result.current.handlePdfInputChange(changeEvent(new File(["%PDF"], "Notes.PDF")));
      return Promise.resolve();
    });

    await waitFor(() => expect(addFiles).toHaveBeenCalled());
  });

  it("does nothing when no pages were chosen or rendered", async () => {
    renderPdfPagesToPng.mockResolvedValue(null);
    const { result, addFiles, setToast } = setup();

    await act(() => {
      result.current.handlePdfInputChange(changeEvent(pdf()));
      return Promise.resolve();
    });
    await waitFor(() => expect(renderPdfPagesToPng).toHaveBeenCalled());

    expect(addFiles).not.toHaveBeenCalled();
    expect(setToast).not.toHaveBeenCalled();
    expect(result.current.isImportingPdf).toBe(false);
  });

  it("says so, and recovers, when rendering fails", async () => {
    renderPdfPagesToPng.mockImplementation(() => Promise.reject(new Error("bad pdf")));
    const { result, setToast } = setup();

    await act(() => {
      result.current.handlePdfInputChange(changeEvent(pdf()));
      return Promise.resolve();
    });

    await waitFor(() =>
      expect(setToast).toHaveBeenCalledWith({
        message: "Could not import PDF. Use a valid page selection like 1, 3-5, or all.",
      }),
    );
    expect(result.current.isImportingPdf).toBe(false);
  });

  it("ignores an empty selection, and does nothing before the canvas API exists", async () => {
    const { result, ref } = setup();

    act(() => result.current.handlePdfInputChange(changeEvent(undefined)));
    expect(renderPdfPagesToPng).not.toHaveBeenCalled();

    ref.current = null;
    await act(() => {
      result.current.handlePdfInputChange(changeEvent(pdf()));
      return Promise.resolve();
    });
    expect(renderPdfPagesToPng).not.toHaveBeenCalled();
  });

  it("opens the file picker by clicking the hidden input", () => {
    const { result } = setup();
    const input = document.createElement("input");
    const click = vi.spyOn(input, "click");
    result.current.pdfInputRef.current = input;

    result.current.openPdfPicker();

    expect(click).toHaveBeenCalledOnce();
  });
});
