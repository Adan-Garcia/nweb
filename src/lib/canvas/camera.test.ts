import { describe, expect, it } from "vitest";

import {
  clampZoom,
  DEFAULT_CAMERA,
  fitRect,
  MAX_ZOOM,
  MIN_ZOOM,
  openingCamera,
  panBy,
  pinch,
  toScene,
  toScreen,
  visibleRect,
  zoomAt,
} from "./camera";

describe("camera", () => {
  const camera = { x: 100, y: 50, zoom: 2 };

  it("converts between screen and scene both ways", () => {
    const scene = toScene(camera, { x: 40, y: 20 });
    expect(scene).toEqual({ x: 120, y: 60 });
    expect(toScreen(camera, scene)).toEqual({ x: 40, y: 20 });
  });

  it("pans by a screen-pixel drag", () => {
    expect(panBy(camera, 20, -10)).toEqual({ x: 90, y: 55, zoom: 2 });
  });

  it("zooms about a point without moving what is under it", () => {
    const anchor = { x: 300, y: 200 };
    const before = toScene(camera, anchor);
    const zoomed = zoomAt(camera, 1.5, anchor);

    expect(zoomed.zoom).toBe(3);
    expect(toScene(zoomed, anchor).x).toBeCloseTo(before.x);
    expect(toScene(zoomed, anchor).y).toBeCloseTo(before.y);
  });

  it("keeps zoom within its limits", () => {
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(zoomAt(DEFAULT_CAMERA, 1000, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
  });

  it("reports the part of the scene in view", () => {
    expect(visibleRect(camera, { width: 800, height: 600 })).toEqual({
      x: 100,
      y: 50,
      width: 400,
      height: 300,
    });
  });
});

describe("pinch", () => {
  it("zooms by how far the fingers spread and keeps the point between them", () => {
    const from = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ] as const;
    const to = [
      { x: 50, y: 100 },
      { x: 250, y: 100 },
    ] as const;
    const next = pinch(DEFAULT_CAMERA, from, to);

    expect(next.zoom).toBe(2);
    expect(toScene(next, { x: 150, y: 100 })).toEqual({ x: 150, y: 100 });
  });

  it("pans with two fingers moving together", () => {
    const next = pinch(
      DEFAULT_CAMERA,
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      [
        { x: 30, y: 40 },
        { x: 40, y: 40 },
      ],
    );

    expect(next).toEqual({ x: -30, y: -40, zoom: 1 });
  });

  it("does not zoom when both fingers started on one point", () => {
    const same = { x: 5, y: 5 };
    expect(pinch(DEFAULT_CAMERA, [same, same], [same, { x: 50, y: 5 }]).zoom).toBe(1);
  });
});

describe("fitRect", () => {
  const viewport = { width: 1000, height: 800 };

  it("centres a large rectangle and zooms out to fit it", () => {
    const camera = fitRect({ x: 0, y: 0, width: 1808, height: 1408 }, viewport, 48);

    expect(camera.zoom).toBeCloseTo(0.5);
    expect(toScreen(camera, { x: 904, y: 704 })).toEqual({ x: 500, y: 400 });
  });

  it("never zooms in past 100% on something small", () => {
    expect(fitRect({ x: 10, y: 10, width: 5, height: 0 }, viewport).zoom).toBe(1);
  });

  it("survives a viewport smaller than its padding", () => {
    expect(fitRect({ x: 0, y: 0, width: 100, height: 100 }, { width: 10, height: 10 }).zoom).toBe(
      MIN_ZOOM,
    );
  });
});

describe("openingCamera", () => {
  it("centres an infinite canvas on its origin at 100%", () => {
    expect(openingCamera(null, { width: 800, height: 600 })).toEqual({ x: -400, y: -300, zoom: 1 });
  });

  it("fits a paged note's first page across the width, never past 100%", () => {
    const page = { x: -408, y: 0, width: 816, height: 1056 };
    const narrow = openingCamera(page, { width: 456, height: 600 });
    expect(narrow.zoom).toBeCloseTo(0.5);
    expect(toScreen(narrow, { x: -408, y: 0 })).toEqual({ x: 24, y: 24 });

    expect(openingCamera(page, { width: 2000, height: 900 }).zoom).toBe(1);
  });
});
