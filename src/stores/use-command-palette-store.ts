import { create } from "zustand";

/**
 * Whether the command palette is open. A store because three unrelated trees open it: the
 * keyboard shortcut, the sidebar's search button and the mobile "More" sheet.
 */
type CommandPaletteState = {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  /** Stable, so it can sit in an effect's dependencies. */
  open: () => void;
};

export const useCommandPaletteStore = create<CommandPaletteState>()((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
  open: () => set({ isOpen: true }),
}));
