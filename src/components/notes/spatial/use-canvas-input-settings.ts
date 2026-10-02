import { useCallback, useEffect, useState } from "react";

import type { InputSettings } from "@/lib/canvas/input-filter";
import {
  DEFAULT_INPUT_SETTINGS,
  readInputSettings,
  saveInputSettings,
} from "@/lib/canvas/input-settings-storage";

/** This device's "draw with finger" and stylus-only settings, read once and saved on change. */
export function useCanvasInputSettings() {
  const [settings, setSettings] = useState<InputSettings>(DEFAULT_INPUT_SETTINGS);

  useEffect(() => {
    let current = true;
    void readInputSettings().then((stored) => {
      if (current) {
        setSettings(stored);
      }
    });

    return () => {
      current = false;
    };
  }, []);

  const update = useCallback(
    (patch: Partial<InputSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      // Kept for next time; this session already has it, so a failed write changes nothing now.
      saveInputSettings(next).catch(() => undefined);
    },
    [settings],
  );

  return { settings, update };
}

export type CanvasInputSettings = ReturnType<typeof useCanvasInputSettings>;
