import { notesTrace } from "./notes-trace";

export async function convertImageBlobToWebp(blob: Blob, quality: number): Promise<Blob> {
  if (!blob.type.startsWith("image/") || blob.type === "image/webp") {
    return blob;
  }

  if (typeof document === "undefined") {
    return blob;
  }

  if (typeof createImageBitmap === "function") {
    const imageBitmap = await createImageBitmap(blob);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;

      const context = canvas.getContext("2d");
      if (!context) {
        return blob;
      }

      context.drawImage(imageBitmap, 0, 0);

      const webpBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
          (result) => {
            resolve(result);
          },
          "image/webp",
          quality,
        );
      });

      notesTrace("media-worker-client", "main-thread-webp-conversion", {
        sourceMimeType: blob.type,
        sourceSize: blob.size,
        resultMimeType: webpBlob?.type ?? blob.type,
        resultSize: webpBlob?.size ?? blob.size,
      });

      return webpBlob ?? blob;
    } finally {
      imageBitmap.close();
    }
  }

  return blob;
}

export function renameToWebp(name: string): string {
  const lastDotIndex = name.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return `${name}.webp`;
  }

  return `${name.slice(0, lastDotIndex)}.webp`;
}
