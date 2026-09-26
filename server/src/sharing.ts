import type { Grant, PutKeysRequest, RevokeRequest, ShareRequest } from "@shared/sharing-contract";

import { normalizeEmail, type Sql } from "./db";
import { keyGraphFor, keysUnder, reachableKeyIds } from "./key-graph";

/**
 * The key graph, stored by a server that can open none of it.
 *
 * Every row here is either a name for a key, a key sealed under another key, or a key
 * sealed under somebody's public key. The server's whole job is to hand the right subset
 * to the right person: what it must never do is hand someone a wrap whose parent they
 * cannot reach, because that is the only thing standing between "the bytes exist" and "the
 * bytes are readable".
 *
 * Which makes what goes *in* here load-bearing. The graph decides which rows the store
 * serves and which a caller may overwrite, and key ids are not secret — every current and
 * former share recipient holds several. So a client may only record edges and grants it
 * already had the standing to make: see `putKeys`, where each of those checks corresponds
 * to an attack that works without it.
 */
export async function putKeys(sql: Sql, userId: string, request: PutKeysRequest): Promise<void> {
  // What the caller already holds, before this request adds anything. `reachable` is what
  // they may read; `writable` is what they may hang things under or grant at full role.
  const reachable = new Set(await reachableKeyIds(sql, userId));
  const writable = new Set(await reachableKeyIds(sql, userId, "writer"));
  const minted = new Set<string>();

  for (const key of request.keys) {
    // `do nothing` on conflict means an id somebody else already owns is left alone — and
    // `returning` is how we know that, so claiming a stranger's key id grants nothing.
    const { rows } = await sql.query<{ id: string }>(
      `insert into keys (id, owner_id, kind, rotated_from) values ($1, $2, $3, $4)
       on conflict (id) do nothing returning id`,
      [key.id, userId, key.kind, key.rotatedFrom],
    );

    if (rows.length) {
      minted.add(key.id);
    }
  }

  const mayHang = (keyId: string) => minted.has(keyId) || writable.has(keyId);

  for (const wrap of request.wraps) {
    // Both ends, because an edge is a claim about both. Without the parent check anyone
    // could hang a victim's key under their own and have the row store serve it to them;
    // without the child check they could overwrite an edge between two keys of somebody
    // else's and break that person's graph.
    if (!mayHang(wrap.parentKeyId) || !mayHang(wrap.childKeyId)) {
      continue;
    }

    // `do nothing`, not `do update`: no flow re-wraps a pair that already exists — a
    // re-send is byte-identical and a rotation always names a new child — so an edge that
    // changes is either a mistake or somebody breaking key derivation for the owner and
    // every other recipient at once.
    await sql.query(
      `insert into key_wraps (parent_key_id, child_key_id, wrapped) values ($1, $2, $3)
       on conflict (parent_key_id, child_key_id) do nothing`,
      [wrap.parentKeyId, wrap.childKeyId, wrap.wrapped],
    );
  }

  for (const grant of request.grants) {
    if (!minted.has(grant.keyId) && !reachable.has(grant.keyId)) {
      continue;
    }

    // A reader re-posting their own grant as a writer would otherwise promote themselves,
    // and the row store would then let them overwrite the owner's rows. Role is taken from
    // what they already have, never from what they ask for.
    const role = mayHang(grant.keyId) ? grant.role : "reader";

    await sql.query(
      `insert into grants (key_id, user_id, role, wrapped) values ($1, $2, $3, $4)
       on conflict (key_id, user_id) do update set
         role = excluded.role, wrapped = excluded.wrapped`,
      [grant.keyId, userId, role, grant.wrapped],
    );
  }
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

  const mayWrite = (await reachableKeyIds(sql, userId, "writer")).includes(request.keyId);
  const { rows: existing } = await sql.query<{ user_id: string }>(
    "select user_id from grants where key_id = $1 and user_id = $2",
    [request.keyId, rows[0].id],
  );

  // Replacing somebody else's grant is a writer's business. Otherwise a reader could hand
  // another recipient junk bytes and quietly cut them off.
  if (existing.length && !mayWrite && rows[0].id !== userId) {
    return "not_yours";
  }

  await sql.query(
    `insert into grants (key_id, user_id, role, wrapped) values ($1, $2, $3, $4)
     on conflict (key_id, user_id) do update set role = excluded.role, wrapped = excluded.wrapped`,
    // You cannot hand out a pen you were not given: a reader passing the key on makes
    // another reader, however the request is spelled.
    [request.keyId, rows[0].id, mayWrite ? request.role : "reader", request.wrapped],
  );

  await sql.query("update rows set seq = nextval('rows_seq') where key_id = any($1)", [
    await keysUnder(sql, request.keyId),
  ]);

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

  // Dropping somebody else's access is a writer's business; dropping your own is always
  // yours, because leaving a share is not an escalation.
  const mayWrite = (await reachableKeyIds(sql, userId, "writer")).includes(request.keyId);

  if (rows[0].id !== userId && !mayWrite) {
    return "not_yours";
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
