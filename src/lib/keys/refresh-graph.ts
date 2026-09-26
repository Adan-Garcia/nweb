import { updateAccountGraph } from "../account/account-record";
import { fetchKeyGraph } from "../api/account-api";
import type { ApiSession } from "../api/client";
import { heldIdentity } from "./identity";
import { mergeKeyGraphs, openKeyGraph } from "./key-graph";
import { adoptSharedKeys, currentKeyGraph, holdServedGraph } from "./object-keys";

/**
 * Takes whatever the server can now reach on this account's behalf.
 *
 * Run every sync round, not only at sign-in. A course shared with you while the app is open
 * arrives as rows whose key this device has never heard of; without this the rows are pulled,
 * fail to open, and the cursor moves past them for good. Keys first, then rows.
 *
 * The result is merged into the cached graph rather than replacing it, so a key minted here
 * and not yet uploaded is not forgotten by a refresh that happens to come first.
 */
export async function refreshKeyGraph(session: ApiSession): Promise<number> {
  const privateKey = heldIdentity();

  if (!privateKey) {
    return 0;
  }

  const graph = await fetchKeyGraph(session);

  if (!graph.ok) {
    return 0;
  }

  const added = adoptSharedKeys(await openKeyGraph(graph.value, privateKey));

  holdServedGraph(graph.value);

  await updateAccountGraph(mergeKeyGraphs(currentKeyGraph(), graph.value));

  return added;
}
