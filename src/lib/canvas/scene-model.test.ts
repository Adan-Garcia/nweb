import { describe, expect, it } from "vitest";

import {
  createPage,
  createScene,
  readScene,
  type Scene,
  SCENE_FORMAT,
  serializeScene,
  type Stroke,
} from "./scene-model";

const stroke: Stroke = {
  id: "s1",
  version: 1,
  index: "a0",
  type: "stroke",
  tool: "pen",
  color: "ink-blue",
  width: 2,
  x: 10.123456,
  y: 20.98765,
  samples: [0, 0, 0.51234, 12.345, -3.21, 0, 1.23456, 2.34567, 0.6, 0, 0, 8.4],
};

function sceneWith(...elements: Scene["elements"]): Scene {
  return { format: SCENE_FORMAT, layout: "infinite", background: "dots", elements };
}

describe("createScene", () => {
  it("starts an infinite note empty, on dots", () => {
    expect(createScene("infinite")).toEqual({
      format: 1,
      layout: "infinite",
      background: "dots",
      elements: [],
    });
  });

  it("starts a paged note with one Letter page", () => {
    const scene = createScene("paged", () => "page-1");

    expect(scene.elements).toEqual([
      {
        id: "page-1",
        version: 1,
        index: "a0",
        type: "page",
        size: "letter",
        orientation: "portrait",
        background: "dots",
      },
    ]);
  });

  it("gives each page a random id by default", () => {
    const [first] = createScene("paged").elements;
    const [second] = createScene("paged").elements;

    expect(first.id).not.toBe(second.id);
  });
});

describe("serializeScene and readScene", () => {
  it("round-trips a scene with every kind of element", () => {
    const scene: Scene = {
      format: 1,
      layout: "paged",
      elements: [
        { ...createPage("a0", "p1"), pdf: { fileId: "pdf-page" } },
        { ...stroke, pageId: "p1" },
        {
          id: "sh",
          version: 3,
          index: "a1",
          type: "shape",
          kind: "line",
          x: 0,
          y: 0,
          width: -40,
          height: 10,
          rotation: 0,
          color: "#12ab34",
          strokeWidth: 3,
          fill: null,
        },
        {
          id: "im",
          version: 1,
          index: "a2",
          type: "image",
          fileId: "hash",
          x: 1,
          y: 2,
          width: 30,
          height: 40,
        },
      ],
      view: { x: 5, y: 6, zoom: 1.5 },
    };

    const read = readScene(serializeScene(scene));

    expect(read.ok).toBe(true);
    expect(read.ok && read.scene.elements.map((element) => element.type)).toEqual([
      "page",
      "stroke",
      "shape",
      "image",
    ]);
  });

  it("keeps a stroke's pressure sensitivity and the zoom it was drawn at", () => {
    const read = readScene(
      serializeScene(sceneWith({ ...stroke, sensitivity: 0.7, zoom: 1.23456 })),
    );

    expect(read.ok && read.scene.elements[0]).toMatchObject({ sensitivity: 0.7, zoom: 1.235 });
  });

  it("rounds positions, pressure, tilt and time to what is worth keeping", () => {
    const read = readScene(serializeScene(sceneWith(stroke)));
    const [saved] = read.ok ? read.scene.elements : [];

    expect(saved).toMatchObject({
      x: 10.12,
      y: 20.99,
      samples: [0, 0, 0.512, 12.3, -3.2, 0, 1.23, 2.35, 0.6, 0, 0, 8],
    });
  });

  it("rounds a shape's position and leaves its size alone", () => {
    const shape = {
      id: "sh",
      version: 1,
      index: "a0",
      type: "shape" as const,
      kind: "rectangle" as const,
      x: 1.005001,
      y: 2.4449,
      width: 10.123,
      height: 5,
      rotation: 0.5,
      color: "ink-red" as const,
      strokeWidth: 2,
      fill: "ink-yellow" as const,
    };
    const read = readScene(serializeScene(sceneWith(shape)));

    expect(read.ok && read.scene.elements[0]).toMatchObject({ x: 1.01, y: 2.44, width: 10.123 });
  });

  it("reports a scene from a newer build instead of reading it", () => {
    expect(readScene(JSON.stringify({ format: 2, elements: "anything" }))).toEqual({
      ok: false,
      reason: "newer-format",
    });
  });

  it.each([
    ["not JSON", "{"],
    ["not an object", "42"],
    ["null", "null"],
    ["Excalidraw's format", JSON.stringify({ type: "excalidraw", elements: [], appState: {} })],
    [
      "a stroke with a partial sample",
      JSON.stringify(sceneWith({ ...stroke, samples: [1, 2, 3] })),
    ],
    ["a bad order key", JSON.stringify(sceneWith({ ...stroke, index: "b0" }))],
    ["an unknown colour", JSON.stringify(sceneWith({ ...stroke, color: "red" }))],
    ["a zero version", JSON.stringify(sceneWith({ ...stroke, version: 0 }))],
  ])("refuses %s as invalid", (_label, serialized) => {
    expect(readScene(serialized)).toEqual({ ok: false, reason: "invalid" });
  });
});
