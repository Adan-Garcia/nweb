import type { NotesDirectoryEntry } from "@/lib/notes-model";
import { compareTwigsByDue, type Twig } from "@/lib/twig-model";
import { branchPath, type WorkspaceSnapshot } from "@/lib/workspace-tree";

/**
 * What the palette can jump to, as plain rows: a label to show, extra words to match on,
 * and where it goes. Pure, so what the palette offers is testable without opening it.
 */
export type PaletteEntry = {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  href: string;
};

/** Notes, most recently edited first, labelled by course so two "Lecture 3"s differ. */
export function noteEntries(
  snapshot: WorkspaceSnapshot,
  entries: NotesDirectoryEntry[],
): PaletteEntry[] {
  return entries.map((entry) => {
    const branch = branchPath(snapshot, entry.branchId)?.branch.name ?? "";

    return {
      id: `note:${entry.id}`,
      label: entry.feather,
      hint: branch,
      keywords: [branch, entry.createdMode === "spatial" ? "canvas" : "text"],
      href: `/notes?note=${encodeURIComponent(entry.id)}`,
    };
  });
}

/** Tasks still to do, soonest first; a finished one is not something to jump to. */
export function taskEntries(snapshot: WorkspaceSnapshot, twigs: Twig[]): PaletteEntry[] {
  return twigs
    .filter((twig) => twig.status !== "complete")
    .sort(compareTwigsByDue)
    .map((twig) => {
      const branch = branchPath(snapshot, twig.branchId)?.branch.name ?? "";

      return {
        id: `task:${twig.id}`,
        label: twig.title,
        hint: [branch, twig.dueDate ?? ""].filter(Boolean).join(" · "),
        keywords: [branch, twig.kind],
        href: `/board?task=${encodeURIComponent(twig.id)}`,
      };
    });
}
