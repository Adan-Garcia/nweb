import { createBranch } from "../hierarchy/entity-storage";
import { ensureDefaultWorkspace } from "../hierarchy/workspace-storage";
import { canFileUnder, findBranch, ownRows } from "../hierarchy/workspace-tree";
import type { FeedSettings } from "./feed-model";
import type { FeedItem } from "./feed-rules";

/**
 * Which course each event from a feed goes in.
 *
 * A `set-branch` rule names one outright; a `branch-from` rule names one by what it is
 * called, which is how one "All Courses" feed becomes one course per class. A name is
 * matched against this workspace's own courses without regard to case, preferring the term
 * the feed files into, and a course that does not exist yet is created there — so the
 * first refresh after a new term starts fills it in on its own.
 *
 * Only this workspace's own courses are candidates: a course shared to read cannot take a
 * new task, and one merely named on somebody else's path is not a course here at all.
 */
export async function resolveFeedBranches(
  items: FeedItem[],
  settings: Pick<FeedSettings, "branchId">,
): Promise<(item: FeedItem) => string> {
  const { snapshot, path } = await ensureDefaultWorkspace();
  const own = ownRows(snapshot);
  const writable = (id: string | null): id is string =>
    id !== null && findBranch(own, id) !== null && canFileUnder(snapshot, id);

  const fallback = writable(settings.branchId) ? settings.branchId : path.branch.id;
  const flightId = findBranch(own, fallback)?.flightId ?? path.flight.id;

  // Same-term courses last, so they win when two terms each have one by that name.
  const byName = new Map(
    [...own.branches]
      .sort(
        (left, right) => Number(left.flightId === flightId) - Number(right.flightId === flightId),
      )
      .map((branch) => [branch.name.trim().toLowerCase(), branch.id]),
  );

  for (const item of items) {
    const name = item.branchName?.trim();

    if (!writable(item.branchId) && name && !byName.has(name.toLowerCase())) {
      byName.set(name.toLowerCase(), (await createBranch({ flightId, name })).id);
    }
  }

  return (item) => {
    if (writable(item.branchId)) {
      return item.branchId;
    }

    return byName.get(item.branchName?.trim().toLowerCase() ?? "") ?? fallback;
  };
}
