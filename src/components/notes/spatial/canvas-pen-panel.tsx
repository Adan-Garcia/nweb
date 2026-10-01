import { useId } from "react";
import { X } from "lucide-react";

import { presetLabel } from "@/components/notes/spatial/canvas-labels";
import type { CanvasTools } from "@/components/notes/spatial/use-canvas-tools";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { MAX_WIDTH, MIN_WIDTH } from "@/lib/canvas/pen-settings";

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  shown: string;
  onChange: (value: number) => void;
};

function Slider({ label, value, min, max, step, shown, onChange }: SliderProps) {
  const id = useId();

  return (
    <Field className="gap-1">
      <div className="flex items-center justify-between text-caption">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <span className="text-muted-foreground tabular-nums">{shown}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="w-full accent-primary"
      />
    </Field>
  );
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * Width, pressure and smoothing for the tool in hand, and the saved presets. Pressure is
 * the pen's alone (the highlighter ignores it); smoothing applies to all ink, everywhere.
 */
export function CanvasPenPanel({ tools }: { tools: CanvasTools }) {
  const { style } = tools;

  return (
    <>
      <Slider
        label="Width"
        value={style.width}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        step={0.5}
        shown={`${style.width} px`}
        onChange={tools.setWidth}
      />
      {tools.tool === "pen" ? (
        <Slider
          label="Pressure"
          value={style.sensitivity}
          min={0}
          max={1}
          step={0.05}
          shown={percent(style.sensitivity)}
          onChange={tools.setSensitivity}
        />
      ) : null}
      <Slider
        label="Smoothing"
        value={tools.smoothing}
        min={0}
        max={1}
        step={0.05}
        shown={percent(tools.smoothing)}
        onChange={tools.setSmoothing}
      />
      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!tools.canSavePreset}
          onClick={tools.savePreset}
        >
          Save as preset
        </Button>
        <ul aria-label="Saved presets" className="flex flex-col gap-1">
          {tools.presets.map((preset) => (
            <li key={preset.id} className="flex items-center justify-between text-caption">
              {presetLabel(preset)}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${presetLabel(preset)}`}
                onClick={() => tools.removePreset(preset.id)}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
