import { useCallback, useEffect, useState } from "react";

import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import {
  softDeleteBranch,
  softDeleteFlight,
  softDeleteNest,
  softDeleteWing,
} from "@/lib/entity-delete";
import type { BranchColor } from "@/lib/entity-model";
import {
  renameBranch,
  renameFlight,
  renameNest,
  renameWing,
  setBranchColor,
} from "@/lib/entity-storage";
import { ownRows } from "@/lib/workspace-tree";

/** Which level a row belongs to. The storage call differs; nothing else about it does. */
export type WorkspaceLevel = "wing" | "flight" | "branch" | "nest";

const RENAME: Record<WorkspaceLevel, (id: string, name: string) => Promise<unknown>> = {
  wing: renameWing,
  flight: renameFlight,
  branch: renameBranch,
  nest: renameNest,
};

const DELETE: Record<WorkspaceLevel, (id: string) => Promise<unknown>> = {
  wing: softDeleteWing,
  flight: softDeleteFlight,
  branch: softDeleteBranch,
  nest: softDeleteNest,
};

/**
 * Rename, recolour and delete, over the storage that has had all three since the entity
 * layer landed and nothing on screen to reach them.
 *
 * Every write re-reads the snapshot rather than patching it. A delete cascades — a wing
 * takes its flights, branches, nests, notes, twigs and pebbles with it — so what changed
 * is more than the row that was touched, and guessing at it here would be a second copy
 * of the cascade rules.
 */
export function useWorkspaceEditor() {
  const { snapshot, refreshSnapshot } = useWorkspaceSnapshot();
  const [isWorking, setIsWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  /**
   * The names are read through the cipher, so this can fail the way any other read of a
   * sealed row can. It is reported rather than thrown: a card that cannot list the
   * workspace should say so, not take the settings page down with it.
   */
  useEffect(() => {
    refreshSnapshot().catch(() => {
      setStatus("The workspace could not be read.");
    });
  }, [refreshSnapshot]);

  const run = useCallback(
    async (message: string, write: () => Promise<unknown>) => {
      setIsWorking(true);

      try {
        await write();
        await refreshSnapshot();
        setStatus(message);
      } catch {
        setStatus("That change could not be saved.");
      } finally {
        setIsWorking(false);
      }
    },
    [refreshSnapshot],
  );

  const rename = useCallback(
    (level: WorkspaceLevel, id: string, name: string) =>
      run(`Renamed to ${name}.`, () => RENAME[level](id, name)),
    [run],
  );

  const recolour = useCallback(
    (id: string, color: BranchColor) =>
      run(`Colour changed to ${color}.`, () => setBranchColor(id, color)),
    [run],
  );

  const remove = useCallback(
    (level: WorkspaceLevel, id: string, name: string) =>
      run(`Deleted ${name}.`, () => DELETE[level](id)),
    [run],
  );

  // Somebody else's wing, known here only as the path to what they shared, is theirs to
  // rename. Listing it would offer a rename that could never reach them.
  return { snapshot: ownRows(snapshot), status, isWorking, rename, recolour, remove };
}
