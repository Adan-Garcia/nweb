import { useCallback, useState } from "react";

import { loadWorkspaceSnapshot } from "@/lib/workspace-storage";
import { emptyWorkspaceSnapshot, type WorkspaceSnapshot } from "@/lib/workspace-tree";

/**
 * The wings, flights, branches and nests, held once and re-read after anything changes
 * them. Names live only here, so a rename shows up everywhere the snapshot is read.
 */
export function useWorkspaceSnapshot() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(emptyWorkspaceSnapshot);

  const refreshSnapshot = useCallback(async () => {
    const next = await loadWorkspaceSnapshot();
    setSnapshot(next);

    return next;
  }, []);

  return { snapshot, setSnapshot, refreshSnapshot };
}
