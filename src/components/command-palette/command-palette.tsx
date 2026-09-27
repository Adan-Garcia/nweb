import { FileText, Lock, Palette, Plus, Settings, SquareCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { NAVIGATION_ITEMS } from "@/components/workspace-nav";
import { useCommandPaletteStore } from "@/stores/use-command-palette-store";

import { PaletteAppearanceGroup } from "./palette-appearance-group";
import type { PaletteEntry } from "./palette-entries";
import { usePaletteData } from "./use-palette-data";
import { usePaletteHotkey } from "./use-palette-hotkey";

type CommandPaletteProps = {
  canLock: boolean;
  onLock: () => void;
};

/** One place to get anywhere and do the common things: ⌘K, "/", or the sidebar's Search. */
export function CommandPalette({ canLock, onLock }: CommandPaletteProps) {
  const isOpen = useCommandPaletteStore((state) => state.isOpen);
  const setOpen = useCommandPaletteStore((state) => state.setOpen);
  const open = useCommandPaletteStore((state) => state.open);
  const navigate = useNavigate();
  const { notes, tasks } = usePaletteData(isOpen);

  usePaletteHotkey(open);

  /** Closes first, so the page it opens is not behind a dialog on its way out. */
  const run = (action: () => void) => {
    setOpen(false);
    action();
  };
  const go = (href: string) => run(() => void navigate(href));

  const entryGroup = (heading: string, entries: PaletteEntry[], Icon: typeof FileText) =>
    entries.length ? (
      <CommandGroup heading={heading}>
        {entries.map((entry) => (
          <CommandItem
            key={entry.id}
            value={`${entry.label} ${entry.id}`}
            keywords={entry.keywords}
            onSelect={() => go(entry.href)}
          >
            <Icon />
            <span className="truncate">{entry.label}</span>
            {entry.hint ? (
              <span className="ml-auto truncate text-caption text-muted-foreground">
                {entry.hint}
              </span>
            ) : null}
          </CommandItem>
        ))}
      </CommandGroup>
    ) : null;

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search notes and tasks, go to a page, or run a command."
    >
      <Command>
        <CommandInput placeholder="Search or type a command…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Go to">
            {NAVIGATION_ITEMS.map((item) => (
              <CommandItem
                key={item.id}
                value={`Go to ${item.title}`}
                onSelect={() => go(item.url)}
              >
                <item.icon />
                {item.title}
              </CommandItem>
            ))}
            <CommandItem value="Go to Settings" onSelect={() => go("/settings")}>
              <Settings />
              Settings
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem value="New task" onSelect={() => go("/board?new=task")}>
              <Plus />
              New task
            </CommandItem>
            <CommandItem value="Customize appearance" onSelect={() => go("/settings#appearance")}>
              <Palette />
              Customize appearance
            </CommandItem>
            {canLock ? (
              <CommandItem value="Lock workspace" onSelect={() => run(onLock)}>
                <Lock />
                Lock workspace
              </CommandItem>
            ) : null}
          </CommandGroup>
          {entryGroup("Notes", notes, FileText)}
          {entryGroup("Tasks", tasks, SquareCheck)}
          <CommandSeparator />
          <PaletteAppearanceGroup onDone={() => setOpen(false)} />
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
