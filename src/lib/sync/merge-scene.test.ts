import { describe, expect, it } from "vitest";

import { mergeScenes } from "./merge-scene";

type Element = { id: string; version: number; index?: string; x?: number; pageId?: string };

const scene = (elements: Element[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: 1, layout: "infinite", elements, ...extra });

const ids = (serialized: string) =>
  (JSON.parse(serialized) as { elements: Element[] }).elements.map(
    (element) => `${element.id}@${element.version}`,
  );

describe("mergeScenes", () => {
  it("keeps a shape each side drew", () => {
    const base = scene([{ id: "a", version: 1 }]);
    const local = scene([
      { id: "a", version: 1 },
      { id: "l", version: 1 },
    ]);
    const remote = scene([
      { id: "a", version: 1 },
      { id: "r", version: 1 },
    ]);

    expect(ids(mergeScenes(base, local, remote, "remote"))).toEqual(["a@1", "l@1", "r@1"]);
  });

  it("takes the side that moved a shape, and the higher version when both did", () => {
    const base = scene([
      { id: "a", version: 1 },
      { id: "b", version: 1 },
    ]);
    const local = scene([
      { id: "a", version: 2 },
      { id: "b", version: 4 },
    ]);
    const remote = scene([
      { id: "a", version: 1 },
      { id: "b", version: 6 },
    ]);

    expect(ids(mergeScenes(base, local, remote, "local"))).toEqual(["a@2", "b@6"]);
    expect(ids(mergeScenes(base, remote, local, "local"))).toEqual(["a@2", "b@6"]);
  });

  it("keeps the higher version when there is no base to ask", () => {
    const local = scene([{ id: "a", version: 3 }]);
    const remote = scene([{ id: "a", version: 2 }]);

    expect(ids(mergeScenes(null, local, remote, "remote"))).toEqual(["a@3"]);
    expect(ids(mergeScenes(null, remote, local, "local"))).toEqual(["a@3"]);
  });

  it("gives an identical version to the preferred side", () => {
    const local = scene([{ id: "a", version: 2, x: 1 }]);
    const remote = scene([{ id: "a", version: 2, x: 9 }]);

    const merged = JSON.parse(mergeScenes(null, local, remote, "remote")) as {
      elements: Element[];
    };

    expect(merged.elements[0].x).toBe(9);
    expect(ids(mergeScenes(null, local, remote, "local"))).toEqual(["a@2"]);
    expect(
      (JSON.parse(mergeScenes(null, local, remote, "local")) as { elements: Element[] }).elements[0]
        .x,
    ).toBe(1);
  });

  it("drops a shape one side deleted and the other left alone", () => {
    const base = scene([
      { id: "a", version: 1 },
      { id: "b", version: 1 },
    ]);

    expect(ids(mergeScenes(base, scene([{ id: "a", version: 1 }]), base, "remote"))).toEqual([
      "a@1",
    ]);
    expect(ids(mergeScenes(base, base, scene([{ id: "b", version: 1 }]), "remote"))).toEqual([
      "b@1",
    ]);
  });

  it("keeps a shape one side deleted and the other edited", () => {
    const base = scene([{ id: "a", version: 1 }]);

    expect(ids(mergeScenes(base, scene([]), scene([{ id: "a", version: 2 }]), "local"))).toEqual([
      "a@2",
    ]);
  });

  it("stacks by the fractional index when every shape has one", () => {
    const local = scene([
      { id: "top", version: 1, index: "a2" },
      { id: "same", version: 1, index: "a1" },
    ]);
    const remote = scene([
      { id: "bottom", version: 1, index: "a0" },
      { id: "twin", version: 1, index: "a1" },
    ]);

    expect(ids(mergeScenes(null, local, remote, "remote"))).toEqual([
      "bottom@1",
      "same@1",
      "twin@1",
      "top@1",
    ]);
  });

  it("keeps the local view settings around the merged shapes", () => {
    const local = scene([], { appState: { zoom: 2 } });
    const remote = scene([], { appState: { zoom: 5 } });

    expect(JSON.parse(mergeScenes(null, local, remote, "remote"))).toMatchObject({
      appState: { zoom: 2 },
    });
  });

  it("keeps the preferred side whole when either scene does not parse", () => {
    const good = scene([{ id: "a", version: 1 }]);

    expect(mergeScenes(null, "not json", good, "local")).toBe("not json");
    expect(mergeScenes(null, good, "{}", "remote")).toBe("{}");
  });

  it("merges against a base that does not parse as if there were none", () => {
    const local = scene([{ id: "a", version: 1 }]);
    const remote = scene([{ id: "b", version: 1 }]);

    expect(ids(mergeScenes("nope", local, remote, "remote"))).toEqual(["a@1", "b@1"]);
  });

  it("brings back a page one side deleted while the other wrote on it", () => {
    const base = scene([{ id: "page", version: 1, index: "a0" }]);
    const local = scene([]);
    const remote = scene([
      { id: "page", version: 1, index: "a0" },
      { id: "ink", version: 1, index: "a1", pageId: "page" },
    ]);

    expect(ids(mergeScenes(base, local, remote, "local"))).toEqual(["page@2", "ink@1"]);
  });

  it("leaves a page alone that is still there, and ink whose page is gone everywhere", () => {
    const local = scene([
      { id: "page", version: 3, index: "a0" },
      { id: "ink", version: 1, index: "a1", pageId: "page" },
      { id: "stray", version: 1, index: "a2", pageId: "never" },
    ]);

    expect(ids(mergeScenes(null, local, local, "local"))).toEqual(["page@3", "ink@1", "stray@1"]);
  });
});
