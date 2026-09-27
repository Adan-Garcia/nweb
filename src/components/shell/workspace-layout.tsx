import { Suspense } from "react";
import { Outlet } from "react-router-dom";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import { WorkspaceShell } from "@/components/shell/workspace-shell";

/**
 * The route every workspace page renders inside. The shell stays mounted between pages, so
 * moving from the calendar to the board swaps the content and nothing else: the sidebar
 * keeps its state, and the lock and sync are not torn down and started again.
 *
 * Its own Suspense boundary is what keeps the sidebar on screen while the next page's code
 * loads; the root one would replace the whole shell with a spinner.
 */
export function WorkspaceLayout() {
  return (
    <WorkspaceShell>
      <Suspense fallback={<PageSkeleton />}>
        <Outlet />
      </Suspense>
    </WorkspaceShell>
  );
}
