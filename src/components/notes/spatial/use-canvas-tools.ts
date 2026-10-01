import { useState } from "react";

import type { InkColor } from "@/lib/canvas/colors";
import type { ToolStyle } from "@/lib/canvas/gesture-types";
import {
  DEFAULT_SENSITIVITY,
  MAX_PEN_PRESETS,
  MAX_WIDTH,
  MIN_WIDTH,
  type PenPreset,
} from "@/lib/canvas/pen-settings";
import type { ShapeKind } from "@/lib/canvas/scene-model";
import type { CanvasTool } from "@/lib/canvas/tools";
import { usePreferencesStore } from "@/stores/use-preferences-store";

/** Which kind of mark each drawing tool keeps its own colour and width for. */
type InkKind = "pen" | "highlighter" | "shape";

type Ink = { color: string; width: number; sensitivity: number };

const DEFAULTS: Record<InkKind, Ink> = {
  pen: { color: "ink-black" satisfies InkColor, width: 2, sensitivity: DEFAULT_SENSITIVITY },
  highlighter: { color: "ink-yellow" satisfies InkColor, width: 16, sensitivity: 0 },
  shape: { color: "ink-black" satisfies InkColor, width: 2, sensitivity: 0 },
};

function inkKind(tool: CanvasTool): InkKind {
  return tool === "highlighter" || tool === "shape" ? tool : "pen";
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The toolbar's state: the tool, and a colour, width and pressure sensitivity for each kind
 * of mark, so picking the highlighter does not leave the pen yellow and fat. Smoothing and
 * the saved presets follow the person, so they live in the synced preferences.
 */
export function useCanvasTools() {
  const [tool, setTool] = useState<CanvasTool>("pen");
  const [inks, setInks] = useState(DEFAULTS);
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rectangle");
  const { preferences, update } = usePreferencesStore();
  const kind = inkKind(tool);
  const ink = inks[kind];

  const style: ToolStyle = { ...ink, shapeKind, fill: null };
  const change = (patch: Partial<Ink>) =>
    setInks((current) => ({ ...current, [kind]: { ...current[kind], ...patch } }));

  /** The pen or highlighter in hand, which is what a preset saves. */
  const presetTool = tool === "pen" || tool === "highlighter" ? tool : null;
  const presets = preferences.penPresets;
  const activePreset = presets.find(
    (preset) =>
      preset.tool === presetTool &&
      preset.color === ink.color &&
      preset.width === ink.width &&
      preset.sensitivity === ink.sensitivity,
  );

  const canSavePreset = !activePreset && presets.length < MAX_PEN_PRESETS;
  const savePreset = () => {
    if (presetTool && canSavePreset) {
      const preset = { id: crypto.randomUUID(), tool: presetTool, ...ink };
      update({ penPresets: [...presets, preset] });
    }
  };

  const applyPreset = (preset: PenPreset) => {
    setTool(preset.tool);
    const { color, width, sensitivity } = preset;
    setInks((current) => ({ ...current, [preset.tool]: { color, width, sensitivity } }));
  };

  return {
    tool,
    setTool,
    style,
    setColor: (color: string) => change({ color }),
    setWidth: (width: number) => change({ width: clamp(width, MIN_WIDTH, MAX_WIDTH) }),
    setSensitivity: (sensitivity: number) => change({ sensitivity: clamp(sensitivity, 0, 1) }),
    shapeKind,
    setShapeKind,
    smoothing: preferences.penSmoothing,
    setSmoothing: (penSmoothing: number) => update({ penSmoothing: clamp(penSmoothing, 0, 1) }),
    presets,
    activePresetId: activePreset?.id ?? null,
    canSavePreset: presetTool !== null && canSavePreset,
    savePreset,
    applyPreset,
    removePreset: (id: string) =>
      update({ penPresets: presets.filter((preset) => preset.id !== id) }),
  };
}

export type CanvasTools = ReturnType<typeof useCanvasTools>;
