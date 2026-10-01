import { describe, expect, it } from "vitest";

import { MAX_PEN_PRESETS, readPenPresets } from "./pen-settings";

describe("readPenPresets", () => {
  const preset = { id: "p", tool: "highlighter", color: "ink-yellow", width: 16, sensitivity: 0 };

  it("keeps each preset that reads, up to the limit", () => {
    const many = Array.from({ length: MAX_PEN_PRESETS + 2 }, (_, i) => ({ ...preset, id: `${i}` }));

    expect(readPenPresets(many)).toHaveLength(MAX_PEN_PRESETS);
    expect(readPenPresets([preset, { ...preset, width: 400 }, null])).toEqual([preset]);
  });

  it("reads nothing from what is not a list", () => {
    expect(readPenPresets(undefined)).toEqual([]);
    expect(readPenPresets({ 0: preset })).toEqual([]);
  });
});
