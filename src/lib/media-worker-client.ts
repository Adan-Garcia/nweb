import { notesTrace, notesTraceError } from "@/lib/notes-trace";

type OptimizeImageRequest = {
  id: number;
  type: "optimize-image";
  payload: {
    buffer: ArrayBuffer;
    mimeType: string;
    quality?: number;
  };
};

type CompressTextRequest = {
  id: number;
  type: "compress-text";
  payload: {
    text: string;
  };
};

type DecompressTextRequest = {
  id: number;
  type: "decompress-text";
  payload: {
    buffer: ArrayBuffer;
    algorithm: string;
  };
};

type WorkerRequest =
  | OptimizeImageRequest
  | CompressTextRequest
  | DecompressTextRequest;

type WorkerResponse =
  | {
      id: number;
      ok: true;
      type: "optimize-image";
      payload: {
        buffer: ArrayBuffer;
        mimeType: string;
      };
    }
  | {
      id: number;
      ok: true;
      type: "compress-text";
      payload: {
        algorithm: string;
        buffer: ArrayBuffer;
      };
    }
  | {
      id: number;
      ok: true;
      type: "decompress-text";
      payload: {
        text: string;
      };
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

type PendingRequest = {
  resolve: (value: WorkerResponse) => void;
  reject: (reason?: unknown) => void;
};

export type TextCompressionResult = {
  algorithm: string;
  bytes: Uint8Array;
};

async function convertImageBlobToWebp(
  blob: Blob,
  quality: number,
): Promise<Blob> {
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

function renameToWebp(name: string): string {
  const lastDotIndex = name.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return `${name}.webp`;
  }

  return `${name.slice(0, lastDotIndex)}.webp`;
}

export class MediaWorkerClient {
  private worker: Worker | null;

  private requestCounter = 0;

  private readonly pendingRequests = new Map<number, PendingRequest>();

  constructor() {
    this.worker =
      typeof Worker === "undefined"
        ? null
        : new Worker(new URL("../workers/mediaWorker.ts", import.meta.url), {
            type: "module",
          });

    if (!this.worker) {
      return;
    }

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pendingRequests.get(response.id);

      if (!pending) {
        return;
      }

      this.pendingRequests.delete(response.id);

      if (response.ok) {
        pending.resolve(response);
        return;
      }

      pending.reject(new Error(response.error));
    };

    this.worker.onerror = (event) => {
      const error = new Error(event.message || "Media worker crashed");

      for (const pending of this.pendingRequests.values()) {
        pending.reject(error);
      }

      this.pendingRequests.clear();
    };
  }

  private async sendRequest(
    request: WorkerRequest,
    transfer: Transferable[] = [],
  ): Promise<WorkerResponse> {
    if (!this.worker) {
      throw new Error("Media worker is unavailable");
    }

    return await new Promise<WorkerResponse>((resolve, reject) => {
      this.pendingRequests.set(request.id, {
        resolve,
        reject,
      });

      this.worker!.postMessage(request, transfer);
    });
  }

  async optimizeImageBlob(blob: Blob, quality = 0.82): Promise<Blob> {
    if (!blob.type.startsWith("image/")) {
      return blob;
    }

    if (blob.type === "image/webp") {
      return blob;
    }

    notesTrace("media-worker-client", "optimizeImageBlob:start", {
      mimeType: blob.type,
      size: blob.size,
      hasWorker: Boolean(this.worker),
    });

    if (!this.worker) {
      try {
        const convertedBlob = await convertImageBlobToWebp(blob, quality);
        notesTrace(
          "media-worker-client",
          "optimizeImageBlob:no-worker-result",
          {
            sourceMimeType: blob.type,
            sourceSize: blob.size,
            resultMimeType: convertedBlob.type,
            resultSize: convertedBlob.size,
          },
        );
        return convertedBlob;
      } catch (error) {
        notesTraceError(
          "media-worker-client",
          "optimizeImageBlob:no-worker-failed",
          error,
          {
            mimeType: blob.type,
            size: blob.size,
          },
        );
        return blob;
      }
    }

    let optimizedBlob = blob;

    try {
      const buffer = await blob.arrayBuffer();
      const request: OptimizeImageRequest = {
        id: ++this.requestCounter,
        type: "optimize-image",
        payload: {
          buffer,
          mimeType: blob.type,
          quality,
        },
      };

      const response = await this.sendRequest(request, [buffer]);
      if (response.ok && response.type === "optimize-image") {
        optimizedBlob = new Blob([response.payload.buffer], {
          type: response.payload.mimeType,
        });
      }
    } catch (error) {
      notesTraceError(
        "media-worker-client",
        "optimizeImageBlob:worker-failed",
        error,
        {
          sourceMimeType: blob.type,
          sourceSize: blob.size,
        },
      );
      optimizedBlob = blob;
    }

    notesTrace("media-worker-client", "optimizeImageBlob:worker-result", {
      sourceMimeType: blob.type,
      sourceSize: blob.size,
      workerResultMimeType: optimizedBlob.type,
      workerResultSize: optimizedBlob.size,
    });

    if (optimizedBlob.type === "image/webp") {
      return optimizedBlob;
    }

    try {
      const convertedBlob = await convertImageBlobToWebp(
        optimizedBlob,
        quality,
      );
      notesTrace("media-worker-client", "optimizeImageBlob:fallback-result", {
        inputMimeType: optimizedBlob.type,
        inputSize: optimizedBlob.size,
        fallbackResultMimeType: convertedBlob.type,
        fallbackResultSize: convertedBlob.size,
      });
      return convertedBlob;
    } catch (error) {
      notesTraceError(
        "media-worker-client",
        "optimizeImageBlob:fallback-failed",
        error,
        {
          inputMimeType: optimizedBlob.type,
          inputSize: optimizedBlob.size,
        },
      );
      return optimizedBlob;
    }
  }

  async optimizeImageFile(file: File, quality = 0.82): Promise<File> {
    const optimizedBlob = await this.optimizeImageBlob(file, quality);
    const shouldRename = optimizedBlob.type === "image/webp";

    return new File(
      [optimizedBlob],
      shouldRename ? renameToWebp(file.name) : file.name,
      {
        type: optimizedBlob.type || file.type,
        lastModified: file.lastModified,
      },
    );
  }

  async compressText(text: string): Promise<TextCompressionResult> {
    if (!this.worker) {
      return {
        algorithm: "none",
        bytes: new TextEncoder().encode(text),
      };
    }

    const request: CompressTextRequest = {
      id: ++this.requestCounter,
      type: "compress-text",
      payload: {
        text,
      },
    };

    const response = await this.sendRequest(request);
    if (!response.ok || response.type !== "compress-text") {
      return {
        algorithm: "none",
        bytes: new TextEncoder().encode(text),
      };
    }

    return {
      algorithm: response.payload.algorithm,
      bytes: new Uint8Array(response.payload.buffer),
    };
  }

  async decompressText(bytes: Uint8Array, algorithm: string): Promise<string> {
    if (!this.worker || algorithm === "none") {
      return new TextDecoder().decode(bytes);
    }

    const sourceBuffer = bytes.slice().buffer;
    const request: DecompressTextRequest = {
      id: ++this.requestCounter,
      type: "decompress-text",
      payload: {
        buffer: sourceBuffer,
        algorithm,
      },
    };

    const response = await this.sendRequest(request, [sourceBuffer]);
    if (!response.ok || response.type !== "decompress-text") {
      return new TextDecoder().decode(bytes);
    }

    return response.payload.text;
  }

  dispose() {
    if (!this.worker) {
      return;
    }

    this.worker.terminate();
    this.worker = null;
    this.pendingRequests.clear();
  }
}

export function createMediaWorkerClient(): MediaWorkerClient {
  return new MediaWorkerClient();
}
