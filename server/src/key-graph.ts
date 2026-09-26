import type { Grant, KeyGraph } from "@shared/sharing-contract";

import { type Sql, toNumber } from "./db";

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
    created_ms: string | number;
  }>(
    `select id, kind, rotated_from,
       (extract(epoch from created_at) * 1000)::bigint as created_ms
     from keys where id = any($1)`,
    [[...reachable]],
  );

  return {
    keys: keyRows.map((key) => ({
      id: key.id,
      kind: key.kind,
      rotatedFrom: key.rotated_from,
      createdAt: toNumber(key.created_ms),
    })),
    wraps,
    grants,
  };
}

/**
 * Every key reachable from the given starting keys, the starting keys included.
 *
 * One recursive query rather than the whole `key_wraps` table read into memory and walked
 * here: the database follows the edges it already has an index on, and touches only the part
 * of the graph that hangs under these keys. `union` rather than `union all` is what makes it
 * terminate on a graph — a note in two nests is reached twice and kept once.
 */
const REACH = `with recursive reach(key_id) as (
    select unnest($1::text[])
    union
    select key_wraps.child_key_id from key_wraps join reach on key_wraps.parent_key_id = reach.key_id
  )
  select key_id from reach`;

async function reachFrom(sql: Sql, roots: string[]): Promise<Set<string>> {
  if (!roots.length) {
    return new Set();
  }

  const { rows } = await sql.query<{ key_id: string }>(REACH, [roots]);

  return new Set(rows.map((row) => row.key_id));
}

/**
 * Every key this user can derive, and the wraps that get there.
 *
 * `role` narrows the starting grants: walking from the writer grants alone gives the keys
 * whose content this user may change, which is a different and smaller set than what they
 * may read. Everything below a writer grant is writable, because a key that opens a
 * container opens what the container wraps.
 *
 * Only wraps whose parent the caller can derive are returned. A wrap under a key they cannot
 * reach is useless to them, but it is also a fact about somebody else's workspace, and there
 * is no reason to publish it.
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

  const reachable = await reachFrom(
    sql,
    grants.map((grant) => grant.keyId),
  );

  const { rows: wrapRows } = await sql.query<{
    parent_key_id: string;
    child_key_id: string;
    wrapped: string;
  }>(
    `select parent_key_id, child_key_id, wrapped from key_wraps
     where parent_key_id = any($1) order by parent_key_id, child_key_id`,
    [[...reachable]],
  );

  const wraps = wrapRows.map((wrap) => ({
    parentKeyId: wrap.parent_key_id,
    childKeyId: wrap.child_key_id,
    wrapped: wrap.wrapped,
  }));

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
  const { rows } = await sql.query<{ key_id: string }>(
    role
      ? "select key_id from grants where user_id = $1 and role = $2"
      : "select key_id from grants where user_id = $1",
    role ? [userId, role] : [userId],
  );

  return [
    ...(await reachFrom(
      sql,
      rows.map((row) => row.key_id),
    )),
  ];
}

/** The keys and everything hanging under them: what a backfill of a new grant covers. */
export async function keysUnder(sql: Sql, keyIds: string[]): Promise<string[]> {
  return [...(await reachFrom(sql, keyIds))];
}
