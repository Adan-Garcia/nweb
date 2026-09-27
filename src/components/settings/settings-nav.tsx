import { SETTINGS_SECTIONS } from "@/components/settings/settings-sections";
import { cn } from "@/lib/utils";

/**
 * The settings page's table of contents: a column beside the sections on a wide screen,
 * and a row of chips that scrolls sideways on a phone.
 */
export function SettingsNav({ activeId }: { activeId: string }) {
  return (
    <nav
      aria-label="Settings sections"
      className="sticky top-0 z-10 -mx-4 overflow-x-auto border-b bg-background/90 px-4 py-2 backdrop-blur md:top-8 md:mx-0 md:overflow-visible md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
    >
      <ul className="flex gap-1 md:flex-col">
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={section.id === activeId ? "location" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-body transition-colors",
                section.id === activeId
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <section.icon className="size-4" />
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
