/**
 * The id of a file dropped onto a canvas: a hash of its bytes, so the same picture dropped
 * into two notes is one stored row. `notes-document-storage.ts` and `notes-delete.ts`
 * count references by this id before deleting anything.
 */
export async function contentFileId(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());

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
