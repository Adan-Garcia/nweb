import { forgetKeyring, holdKeyring } from "@/lib/keys/object-keys";

/**
 * Puts this device in the position of somebody a thing was shared with to read: each key
 * named is reached through a reader grant and nothing else. Returns the undo.
 *
 * The keys themselves are not held — the guards under test decide from the graph alone,
 * before anything would need opening.
 */
export function sharedToRead(...keyIds: string[]): () => void {
  holdKeyring(new Map(), {
    keys: [],
    wraps: [],
    grants: keyIds.map((keyId) => ({ keyId, role: "reader" as const, wrapped: "g" })),
  });

  return forgetKeyring;
}
