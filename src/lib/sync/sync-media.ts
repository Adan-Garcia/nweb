import { cipherNameSchema } from "@shared/cipher-name";
import { mediaListSchema, type MediaMeta } from "@shared/sync-contract";

import { apiFetchBytes, apiRequest, apiSendBytes, type ApiSession } from "../api/client";
import { getNotesDb } from "../notes-db";

/**
 * Media, which syncs on its own because it is the one thing here that is not small.
 *
 * A picture is keyed by a hash of its contents, so the same image in two notes is one row
 * and one upload, and a file that is already on the server never goes twice. The bytes are
 * whatever is stored — ciphertext when the workspace has a passphrase — and the server is
 * told which key sealed them so another device knows whether it can open them.
 */
export type MediaSyncOutcome = { uploaded: number; downloaded: number };

function metaHeaders(meta: MediaMeta): Record<string, string> {
  return {
    "x-media-type": meta.mimeType,
    "x-media-created": String(meta.created),
    "x-media-updated": String(meta.updatedAt),
    "x-media-key": meta.keyId,
    "x-media-encryption": meta.encryption,
  };
}

/** What came back with the bytes, checked rather than assumed. */
function metaFromHeaders(id: string, headers: Headers): MediaMeta | null {
  const encryption = cipherNameSchema.safeParse(headers.get("x-media-encryption"));

  if (!encryption.success) {
    return null;
  }

  return {
    id,
    mimeType: headers.get("x-media-type") ?? "",
    created: Number(headers.get("x-media-created") ?? 0),
    updatedAt: Number(headers.get("x-media-updated") ?? 0),
    keyId: headers.get("x-media-key") ?? "",
    encryption: encryption.data,
  };
}

export async function syncMedia(session: ApiSession): Promise<MediaSyncOutcome | null> {
  const listed = await apiRequest(session, "/v1/media", {
    method: "GET",
    schema: mediaListSchema,
  });

  if (!listed.ok) {
    return null;
  }

  const database = await getNotesDb();
  const local = await database.getAll("notes-media");
  const remote = new Map(listed.value.media.map((meta) => [meta.id, meta]));

  let uploaded = 0;
  let downloaded = 0;

  for (const record of local) {
    const theirs = remote.get(record.id);

    // The id is a content hash, so a file the server already has is the same file. Only a
    // rekey changes the bytes under one, and that moves `updatedAt`.
    if (theirs && theirs.updatedAt >= record.updatedAt) {
      continue;
    }

    const bytes = new Uint8Array(await record.blob.arrayBuffer());
    const sent = await apiSendBytes(
      session,
      `/v1/media/${encodeURIComponent(record.id)}`,
      bytes,
      metaHeaders({
        id: record.id,
        mimeType: record.mimeType,
        created: record.created,
        updatedAt: record.updatedAt,
        keyId: record.keyId ?? "",
        encryption: record.encryption ?? "none",
      }),
    );

    if (sent.ok) {
      uploaded += 1;
    }
  }

  const here = new Set(local.map((record) => record.id));

  for (const meta of listed.value.media) {
    if (here.has(meta.id)) {
      continue;
    }

    const fetched = await apiFetchBytes(session, `/v1/media/${encodeURIComponent(meta.id)}`);

    if (!fetched.ok) {
      continue;
    }

    const confirmed = metaFromHeaders(meta.id, fetched.value.headers) ?? meta;

    await database.put("notes-media", {
      id: meta.id,
      blob: new Blob([Uint8Array.from(fetched.value.bytes)]),
      mimeType: confirmed.mimeType,
      created: confirmed.created,
      updatedAt: confirmed.updatedAt,
      keyId: confirmed.keyId || undefined,
      encryption: confirmed.encryption,
    });
    downloaded += 1;
  }

  return { uploaded, downloaded };
}
