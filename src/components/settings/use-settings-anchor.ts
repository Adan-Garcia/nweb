import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { SETTINGS_SECTIONS } from "@/components/settings/settings-sections";

/**
 * The section the address names, scrolled to. The router does not scroll to a hash on its
 * own, and "Customize…" in the theme menu lands here from another page.
 */
export function useSettingsAnchor(): string {
  const { hash } = useLocation();
  const requested = hash.replace(/^#/, "");
  const activeId = SETTINGS_SECTIONS.some((section) => section.id === requested)
    ? requested
    : SETTINGS_SECTIONS[0].id;

  useEffect(() => {
    if (requested) {
      document.getElementById(requested)?.scrollIntoView?.({ block: "start" });
    }
  }, [requested]);

  return activeId;
}
