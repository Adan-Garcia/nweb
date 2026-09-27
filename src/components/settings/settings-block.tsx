import type { ReactNode } from "react";

import { SETTINGS_SECTIONS } from "@/components/settings/settings-sections";

/** One anchored section of the settings page; the offset keeps it clear of the sticky nav. */
export function SettingsBlock({ id, children }: { id: string; children: ReactNode }) {
  const label = SETTINGS_SECTIONS.find((section) => section.id === id)?.label;

  return (
    <section id={id} aria-label={label} className="scroll-mt-16 md:scroll-mt-8">
      {children}
    </section>
  );
}
