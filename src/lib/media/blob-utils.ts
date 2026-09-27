export function revokeObjectUrls(urls: readonly string[]) {
  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
}

/** Hands the browser a generated file to save, then releases the object URL. */
export function downloadTextFile(contents: string, fileName: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
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
