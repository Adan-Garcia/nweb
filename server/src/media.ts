import type { MediaMeta } from "@shared/sync-contract";

import { type Sql, toNumber } from "./db";
import { reachableKeyIds } from "./sharing";

/**
 * Media is stored beside the rows rather than in them: a note is a few kilobytes and a
 * scanned lecture is not, and putting one in the other means every sync of a title drags
 * the picture with it.
 */
export async function putMedia(
  sql: Sql,
  userId: string,
  meta: MediaMeta,
  bytes: Uint8Array,
): Promise<void> {
  await sql.query(
    `insert into media (user_id, id, mime_type, created, updated_at, key_id, encryption, bytes)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (user_id, id) do update set
       seq = nextval('rows_seq'),
       mime_type = excluded.mime_type,
       updated_at = excluded.updated_at,
       key_id = excluded.key_id,
       encryption = excluded.encryption,
       bytes = excluded.bytes
     where media.updated_at < excluded.updated_at`,
    [
      userId,
      meta.id,
      meta.mimeType,
      meta.created,
      meta.updatedAt,
      meta.keyId,
      meta.encryption,
      Buffer.from(bytes),
    ],
  );
}

export async function getMedia(
  sql: Sql,
  userId: string,
  id: string,
): Promise<{ meta: MediaMeta; bytes: Uint8Array } | null> {
  const { rows } = await sql.query<{
    id: string;
    mime_type: string;
    created: string | number;
    updated_at: string | number;
    key_id: string;
    encryption: MediaMeta["encryption"];
    bytes: Uint8Array;
    // The same rule as rows: the picture inside a shared note is reachable because its key
    // is, and a caller who cannot derive that key is served nothing.
  }>("select * from media where id = $2 and (user_id = $1 or key_id = any($3))", [
    userId,
    id,
    await reachableKeyIds(sql, userId),
  ]);

  const record = rows[0];

  if (!record) {
    return null;
  }

  return {
    meta: {
      id: record.id,
      mimeType: record.mime_type,
      created: toNumber(record.created),
      updatedAt: toNumber(record.updated_at),
      keyId: record.key_id,
      encryption: record.encryption,
    },
    bytes: record.bytes,
  };
}

/** What this account holds, so a device can tell what it is missing without fetching it. */
export async function listMedia(sql: Sql, userId: string): Promise<MediaMeta[]> {
  const { rows } = await sql.query<{
    id: string;
    mime_type: string;
    created: string | number;
    updated_at: string | number;
    key_id: string;
    encryption: MediaMeta["encryption"];
  }>(
    `select id, mime_type, created, updated_at, key_id, encryption
     from media where user_id = $1 or key_id = any($2) order by id`,
    [userId, await reachableKeyIds(sql, userId)],
  );

  return rows.map((record) => ({
    id: record.id,
    mimeType: record.mime_type,
    created: toNumber(record.created),
    updatedAt: toNumber(record.updated_at),
    keyId: record.key_id,
    encryption: record.encryption,
  }));
}
