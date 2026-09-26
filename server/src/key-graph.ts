import type { Grant, KeyGraph } from "@shared/sharing-contract";

import type { Sql } from "./db";

/**
 * Walking the key graph on the server: who can derive what.
 *
 * The answer decides which rows the store serves and which a caller may overwrite, so it is
 * kept apart from the operations that change the graph (`sharing.ts`) — one file answers the
 * question, the other is checked against it.
 */
/**
 * What this user can walk: the keys granted to them, everything reachable beneath those,
 * and the wraps that get from one to the other.
 *
 * The reachable set is computed here rather than handing over every wrap in the table. A
 * wrap whose parent the caller cannot derive is useless to them, but it is also a fact
 * about somebody else's workspace, and there is no reason to publish it.
 */
export async function keyGraphFor(sql: Sql, userId: string): Promise<KeyGraph> {
  const { grants, reachable, wraps } = await walkFrom(sql, userId);

  const { rows: keyRows } = await sql.query<{
    id: string;
    kind: KeyGraph["keys"][number]["kind"];
    rotated_from: string | null;
  }>("select id, kind, rotated_from from keys");

  return {
    keys: keyRows
      .filter((key) => reachable.has(key.id))
      .map((key) => ({ id: key.id, kind: key.kind, rotatedFrom: key.rotated_from })),
    wraps,
    grants,
  };
}

/**
 * Every key this user can derive, and the wraps that get there.
 *
 * `role` narrows the starting grants: walking from the writer grants alone gives the keys
 * whose content this user may change, which is a different and smaller set than what they
 * may read. Everything below a writer grant is writable, because a key that opens a
 * container opens what the container wraps.
 */
async function walkFrom(
  sql: Sql,
  userId: string,
  role?: Grant["role"],
): Promise<{ grants: Grant[]; reachable: Set<string>; wraps: KeyGraph["wraps"] }> {
  const { rows: grantRows } = await sql.query<{
    key_id: string;
    role: Grant["role"];
    wrapped: string;
  }>(
    role
      ? "select key_id, role, wrapped from grants where user_id = $1 and role = $2"
      : "select key_id, role, wrapped from grants where user_id = $1",
    role ? [userId, role] : [userId],
  );

  const grants: Grant[] = grantRows.map((row) => ({
    keyId: row.key_id,
    role: row.role,
    wrapped: row.wrapped,
  }));

  const { rows: wrapRows } = await sql.query<{
    parent_key_id: string;
    child_key_id: string;
    wrapped: string;
  }>("select parent_key_id, child_key_id, wrapped from key_wraps");

  const byParent = new Map<string, typeof wrapRows>();

  for (const wrap of wrapRows) {
    byParent.set(wrap.parent_key_id, [...(byParent.get(wrap.parent_key_id) ?? []), wrap]);
  }

  const reachable = new Set(grants.map((grant) => grant.keyId));
  const wraps: KeyGraph["wraps"] = [];
  const queue = [...reachable];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parent = queue[cursor];

    for (const wrap of byParent.get(parent) ?? []) {
      wraps.push({
        parentKeyId: wrap.parent_key_id,
        childKeyId: wrap.child_key_id,
        wrapped: wrap.wrapped,
      });

      // A graph, not a tree: a note in two nests is reached twice and enqueued once.
      if (!reachable.has(wrap.child_key_id)) {
        reachable.add(wrap.child_key_id);
        queue.push(wrap.child_key_id);
      }
    }
  }

  return { grants, reachable, wraps };
}

/**
 * The keys whose rows this user may be served, or may write.
 *
 * This is the rule the row store is scoped by: a row is handed over when the caller can
 * derive the key that sealed it, and refused otherwise. Owning it is not the test —
 * somebody else's course, shared with them, is exactly the case that matters — and neither
 * is asking nicely, because the bytes are useless without the key either way.
 */
export async function reachableKeyIds(
  sql: Sql,
  userId: string,
  role?: Grant["role"],
): Promise<string[]> {
  return [...(await walkFrom(sql, userId, role)).reachable];
}

/**
 * The key and everything hanging under it.
 *
 * A grant makes those rows new to somebody, and `seq` is this server's answer to "what is
 * new to me" — so without re-stamping them, a recipient whose cursor is already past the
 * owner's writes steps straight over the share and never sees it. Anyone who has used their
 * own workspace at all is in that position; only a first-ever sync from zero is not.
 */
export async function keysUnder(sql: Sql, keyId: string): Promise<string[]> {
  const { rows } = await sql.query<{ parent_key_id: string; child_key_id: string }>(
    "select parent_key_id, child_key_id from key_wraps",
  );

  const byParent = new Map<string, string[]>();

  for (const wrap of rows) {
    byParent.set(wrap.parent_key_id, [
      ...(byParent.get(wrap.parent_key_id) ?? []),
      wrap.child_key_id,
    ]);
  }

  const reached = new Set([keyId]);
  const queue = [keyId];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const child of byParent.get(queue[cursor]) ?? []) {
      if (!reached.has(child)) {
        reached.add(child);
        queue.push(child);
      }
    }
  }

  return [...reached];
}
