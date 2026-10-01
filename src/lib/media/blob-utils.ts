import { base64ToBytes } from "../crypto/base64";

export function revokeObjectUrls(urls: readonly string[]) {
  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
}

/** Hands the browser a generated file to save, then releases the object URL. */
export function downloadTextFile(contents: string, fileName: string, mimeType: string) {
  downloadBlob(new Blob([contents], { type: mimeType }), fileName);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to read blob as data URL"));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read blob as data URL"));
    };

    reader.readAsDataURL(blob);
  });
}

/** The inverse of `blobToDataUrl` for a base64 data URL; null for anything else. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]*);base64,(.*)$/.exec(dataUrl);
  if (!match) {
    return null;
  }

  try {
    return new Blob([base64ToBytes(match[2])], { type: match[1] });
  } catch {
    return null;
  }
}
