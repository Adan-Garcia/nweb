import type { KeyGraph } from "@shared/sharing-contract";

import { getNotesDb } from "../notes-db";
import { currentKeyGraph, servedKeyGraph } from "./object-keys";

/**
 * Whether this device may change what a key seals, or only read it.
 *
 * The server already refuses a reader's write; this is the same answer asked on the client,
 * so the app can refuse the pen instead of letting someone type into a note whose edits go
 * nowhere. It is the same walk the server does (`server/src/key-graph.ts`): from the grants
 * held as a writer, everything beneath is writable; from the rest, readable only.
 *
 * A key this device cannot place in the graph at all is its own — a workspace with no
 * account, or a key minted here and not yet uploaded — and is writable, which is what keeps
 * a local workspace exactly as it was.
 */
export type KeyAccess = { reachable: Set<string>; writable: Set<string> };

function walk(graphs: KeyGraph[], roots: string[]): Set<string> {
  const byParent = new Map<string, string[]>();

  for (const wrap of graphs.flatMap((graph) => graph.wraps)) {
    byParent.set(wrap.parentKeyId, [...(byParent.get(wrap.parentKeyId) ?? []), wrap.childKeyId]);
  }

  const reached = new Set(roots);
  const queue = [...roots];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const child of byParent.get(queue[cursor]) ?? []) {
      if (!reached.has(child)) {
        reached.add(child);
        queue.push(child);
      }
    }
  }

  return reached;
}

export function keyAccess(graphs: (KeyGraph | null)[]): KeyAccess {
  const present = graphs.filter((graph): graph is KeyGraph => graph !== null);
  const grants = present.flatMap((graph) => graph.grants);

  return {
    reachable: walk(
      present,
      grants.map((grant) => grant.keyId),
    ),
    writable: walk(
      present,
      grants.filter((grant) => grant.role === "writer").map((grant) => grant.keyId),
    ),
  };
}

/** True only for a key this account reaches through reader grants and no writer grant. */
export function isReadOnlyKey(
  keyId: string | null | undefined,
  access: KeyAccess = keyAccess([currentKeyGraph(), servedKeyGraph()]),
): boolean {
  if (!keyId) {
    return false;
  }

  return access.reachable.has(keyId) && !access.writable.has(keyId);
}

/**
 * Whether the note with this id may be edited here. The directory row is the one that says
 * which key a note is under, as it is for every other question about a note's key.
 */
export async function canWriteNote(noteId: string | null): Promise<boolean> {
  if (!noteId) {
    return true;
  }

  const database = await getNotesDb();

  return !isReadOnlyKey((await database.get("notes-directory", noteId))?.keyId);
}
