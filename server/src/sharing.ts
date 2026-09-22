import type {
  Grant,
  KeyGraph,
  PutKeysRequest,
  RevokeRequest,
  ShareRequest,
} from "@shared/sharing-contract";

import { normalizeEmail, type Sql } from "./db";

/**
 * The key graph, stored by a server that can open none of it.
 *
 * Every row here is either a name for a key, a key sealed under another key, or a key
 * sealed under somebody's public key. The server's whole job is to hand the right subset
 * to the right person: what it must never do is hand someone a wrap whose parent they
 * cannot reach, because that is the only thing standing between "the bytes exist" and "the
 * bytes are readable".
 */
export async function putKeys(sql: Sql, userId: string, request: PutKeysRequest): Promise<void> {
  for (const key of request.keys) {
    await sql.query(
      `insert into keys (id, owner_id, kind, rotated_from) values ($1, $2, $3, $4)
       on conflict (id) do nothing`,
      [key.id, userId, key.kind, key.rotatedFrom],
    );
  }

  for (const wrap of request.wraps) {
    await sql.query(
      `insert into key_wraps (parent_key_id, child_key_id, wrapped) values ($1, $2, $3)
       on conflict (parent_key_id, child_key_id) do update set wrapped = excluded.wrapped`,
      [wrap.parentKeyId, wrap.childKeyId, wrap.wrapped],
    );
  }

  for (const grant of request.grants) {
    await sql.query(
      `insert into grants (key_id, user_id, role, wrapped) values ($1, $2, $3, $4)
       on conflict (key_id, user_id) do update set
         role = excluded.role, wrapped = excluded.wrapped`,
      [grant.keyId, userId, grant.role, grant.wrapped],
    );
  }
}

/**
 * What this user can walk: the keys granted to them, everything reachable beneath those,
 * and the wraps that get from one to the other.
 *
 * The reachable set is computed here rather than handing over every wrap in the table. A
 * wrap whose parent the caller cannot derive is useless to them, but it is also a fact
 * about somebody else's workspace, and there is no reason to publish it.
 */
export async function keyGraphFor(sql: Sql, userId: string): Promise<KeyGraph> {
  const { rows: grantRows } = await sql.query<{
    key_id: string;
    role: Grant["role"];
    wrapped: string;
  }>("select key_id, role, wrapped from grants where user_id = $1", [userId]);

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

export type ShareOutcome = "shared" | "no_such_user" | "not_yours";

/**
 * Hands a key to someone else.
 *
 * The wrap itself was made on the sharer's device against the recipient's published public
 * key, so this stores bytes and checks one thing: that the sharer can reach the key they
 * are giving away. Without that check anyone could grant anyone access to anything, since
 * the wrap is opaque and the server cannot tell a real one from a forgery.
 */
export async function share(
  sql: Sql,
  userId: string,
  request: ShareRequest,
): Promise<ShareOutcome> {
  const graph = await keyGraphFor(sql, userId);

  if (!graph.keys.some((key) => key.id === request.keyId)) {
    return "not_yours";
  }

  const { rows } = await sql.query<{ id: string }>("select id from users where email = $1", [
    normalizeEmail(request.email),
  ]);

  if (!rows[0]) {
    return "no_such_user";
  }

  await sql.query(
    `insert into grants (key_id, user_id, role, wrapped) values ($1, $2, $3, $4)
     on conflict (key_id, user_id) do update set role = excluded.role, wrapped = excluded.wrapped`,
    [request.keyId, rows[0].id, request.role, request.wrapped],
  );

  return "shared";
}

/**
 * Takes a key back.
 *
 * The grant goes, so the server will not hand those bytes over again. What it cannot do is
 * unsee what the other person already read — that needs the key rotated and the content
 * re-encrypted, which is the client's job and is why `rotatedFrom` exists.
 */
export async function revoke(
  sql: Sql,
  userId: string,
  request: RevokeRequest,
): Promise<ShareOutcome> {
  const graph = await keyGraphFor(sql, userId);

  if (!graph.keys.some((key) => key.id === request.keyId)) {
    return "not_yours";
  }

  const { rows } = await sql.query<{ id: string }>("select id from users where email = $1", [
    normalizeEmail(request.email),
  ]);

  if (!rows[0]) {
    return "no_such_user";
  }

  await sql.query("delete from grants where key_id = $1 and user_id = $2", [
    request.keyId,
    rows[0].id,
  ]);

  return "shared";
}

/** Who this key has been given to, by address. Never the wraps themselves. */
export async function sharesOf(
  sql: Sql,
  userId: string,
  keyId: string,
): Promise<{ email: string; role: Grant["role"] }[] | null> {
  const graph = await keyGraphFor(sql, userId);

  if (!graph.keys.some((key) => key.id === keyId)) {
    return null;
  }

  const { rows } = await sql.query<{ email: string; role: Grant["role"] }>(
    `select users.email, grants.role from grants
     join users on users.id = grants.user_id
     where grants.key_id = $1 order by users.email`,
    [keyId],
  );

  return rows;
}

export async function publicKeyFor(sql: Sql, email: string): Promise<string | null> {
  const { rows } = await sql.query<{ public_key: string }>(
    "select public_key from users where email = $1",
    [normalizeEmail(email)],
  );

  return rows[0]?.public_key ?? null;
}
