import { describe, expect, it, vi } from "vitest";

import { createScene } from "@/lib/canvas/scene-model";
import { stubCanvasDrawing } from "@/test/canvas-context";

import { canvasBlob, rasterize } from "./canvas-raster";

const options = { images: new Map(), smoothing: 0.5 };
const scene = createScene("infinite");

describe("rasterize", () => {
  it("draws a region at the scale asked, under white when it must be opaque", () => {
    const { context } = stubCanvasDrawing();
    const canvas = rasterize(scene, [], { x: 10, y: 20, width: 100, height: 50 }, 2, {
      ...options,
      opaque: true,
    });

    expect([canvas.width, canvas.height]).toEqual([200, 100]);
    expect(context.globalCompositeOperation).toBe("destination-over");
    expect(context.fillRect).toHaveBeenLastCalledWith(0, 0, 200, 100);
  });

  it("scales down rather than ask for a canvas too large to make, and stays clear", () => {
    const { context } = stubCanvasDrawing();
    const canvas = rasterize(scene, [], { x: 0, y: 0, width: 20000, height: 10 }, 2, {
      ...options,
      opaque: false,
    });

    expect(canvas.width).toBe(8192);
    expect(context.globalCompositeOperation).toBeUndefined();
  });

  it("hands back an empty canvas where there is no 2D context", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    expect(
      rasterize(scene, [], { x: 0, y: 0, width: 0, height: 0 }, 1, { ...options, opaque: true })
        .width,
    ).toBe(1);
  });
});

describe("canvasBlob", () => {
  it("encodes the canvas as the type asked for", async () => {
    stubCanvasDrawing();

    expect((await canvasBlob(document.createElement("canvas"), "image/jpeg"))?.type).toBe(
      "image/jpeg",
    );
  });
});
