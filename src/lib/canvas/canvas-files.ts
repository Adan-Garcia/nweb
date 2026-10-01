import { blobToDataUrl, dataUrlToBlob } from "../media/blob-utils";

/**
 * The id of a file dropped onto a canvas: a hash of its bytes, so the same picture dropped
 * into two notes is one stored row. `notes-document-storage.ts` and `notes-delete.ts`
 * count references by this id before deleting anything.
 */
export async function contentFileId(blob: Blob): Promise<string> {
  // Viewed through a typed array of this realm: a Blob from another one (jsdom's, in tests)
  // hands back an ArrayBuffer that older Node WebCrypto refuses as not an ArrayBuffer.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A file a canvas draws: loaded from storage (a URL only) or added this session (a blob too). */
export type CanvasFile = {
  id: string;
  mimeType: string;
  created: number;
  url: string;
  /** Present for a file added since the note was opened, until it is saved. */
  blob?: Blob;
};

export type CanvasFiles = ReadonlyMap<string, CanvasFile>;

/**
 * A file that can outlive the note it was copied from: its bytes in hand, so the note it is
 * pasted into can save it, and a data URL rather than an object URL, which the source note
 * revokes when it closes. Null when neither the bytes nor the URL can be read.
 */
export async function portableFile(file: CanvasFile): Promise<CanvasFile | null> {
  const blob = file.blob ?? dataUrlToBlob(file.url);
  if (!blob) {
    return null;
  }

  const url = file.url.startsWith("data:") ? file.url : await blobToDataUrl(blob);

  return { ...file, url, blob };
}
