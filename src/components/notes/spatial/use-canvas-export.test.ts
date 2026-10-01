import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPage, createScene, type ImageElement, type Scene } from "@/lib/canvas/scene-model";
import { stubCanvasDrawing } from "@/test/canvas-context";

import { useCanvasExport } from "./use-canvas-export";

const notifyError = vi.fn<(message: string) => void>();
const notifyInfo = vi.fn<(message: string) => void>();
vi.mock("@/lib/toast", () => ({
  notifyError: (message: string) => notifyError(message),
  notifyInfo: (message: string) => notifyInfo(message),
}));

const downloadBlob = vi.fn<(blob: Blob, name: string) => void>();
vi.mock("@/lib/media/blob-utils", () => ({
  downloadBlob: (blob: Blob, name: string) => downloadBlob(blob, name),
}));

const picture: ImageElement = {
  id: "img",
  version: 1,
  index: "a1",
  type: "image",
  fileId: "f",
  x: 0,
  y: 0,
  width: 100,
  height: 2000,
};

function setup(scene: Scene) {
  return renderHook(() =>
    useCanvasExport({
      sceneState: {
        liveRef: {
          current: { scene, files: new Map(), history: { undo: [], redo: [] }, revision: 0 },
        },
      },
      camera: {
        cameraRef: { current: { x: 0, y: 0, zoom: 1 } },
        viewport: { width: 400, height: 300 },
      },
      images: new Map(),
    }),
  );
}

beforeEach(() => {
  notifyError.mockReset();
  notifyInfo.mockReset();
  downloadBlob.mockReset();
});

describe("useCanvasExport", () => {
  it("saves a PNG of the drawing", async () => {
    stubCanvasDrawing();
    const { result } = setup({ ...createScene("infinite"), elements: [picture] });

    await act(() => result.current.exportPng());

    const [blob, name] = downloadBlob.mock.calls[0];
    expect(blob.type).toBe("image/png");
    expect(name).toMatch(/^drawing-\d{4}-\d{2}-\d{2}\.png$/);
    expect(result.current.isExporting).toBe(false);
  });

  it("saves a PDF with a page for each sheet", async () => {
    stubCanvasDrawing();
    const { result } = setup({ ...createScene("infinite"), elements: [picture] });

    await act(() => result.current.exportPdf());

    const [blob, name] = downloadBlob.mock.calls[0];
    expect(blob.type).toBe("application/pdf");
    expect(name).toMatch(/\.pdf$/);
    expect((await blob.text()).match(/\/Type \/Page /g)).toHaveLength(2);
  });

  it("prints a paged note page for page", async () => {
    stubCanvasDrawing();
    const { result } = setup({
      format: 1,
      layout: "paged",
      elements: [createPage("a0", "p1"), createPage("a1", "p2"), createPage("a2", "p3")],
    });

    await act(() => result.current.exportPdf());

    expect((await downloadBlob.mock.calls[0][0].text()).match(/\/Type \/Page /g)).toHaveLength(3);
  });

  it("says there is nothing to export for an empty note", async () => {
    const { result } = setup(createScene("infinite"));

    await act(() => result.current.exportPng());
    await act(() => result.current.exportPdf());

    expect(notifyInfo).toHaveBeenCalledTimes(2);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it("reports a drawing the browser cannot encode", async () => {
    const { toBlob } = stubCanvasDrawing();
    toBlob.mockImplementation((callback) => callback(null));
    const { result } = setup({ ...createScene("infinite"), elements: [picture] });

    await act(() => result.current.exportPng());
    await act(() => result.current.exportPdf());

    expect(notifyError).toHaveBeenCalledTimes(2);
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
