import type {
  OptimizeImageRequest,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/media/media-worker-protocol";
import { compressText, decompressText } from "@/lib/media/text-compression";

type WorkerScope = {
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

const workerScope = self as unknown as WorkerScope;

function postResponse(response: WorkerResponse, transfer: Transferable[] = []) {
  workerScope.postMessage(response, transfer);
}

async function optimizeImageToWebp(
  payload: OptimizeImageRequest["payload"],
): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const sourceBlob = new Blob([payload.buffer], { type: payload.mimeType });
  const shouldConvert = sourceBlob.type.startsWith("image/") && sourceBlob.type !== "image/webp";

  if (
    !shouldConvert ||
    typeof createImageBitmap !== "function" ||
    typeof OffscreenCanvas === "undefined"
  ) {
    return {
      buffer: await sourceBlob.arrayBuffer(),
      mimeType: sourceBlob.type || payload.mimeType,
    };
  }

  const imageBitmap = await createImageBitmap(sourceBlob);

  try {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const context = canvas.getContext("2d", {
      alpha: true,
      desynchronized: true,
    });

    if (!context) {
      return {
        buffer: await sourceBlob.arrayBuffer(),
        mimeType: sourceBlob.type || payload.mimeType,
      };
    }

    context.drawImage(imageBitmap, 0, 0);

    const webpBlob = await canvas.convertToBlob({
      type: "image/webp",
      quality: payload.quality ?? 0.82,
    });

    return {
      buffer: await webpBlob.arrayBuffer(),
      mimeType: "image/webp",
    };
  } finally {
    imageBitmap.close();
  }
}

async function handleMessage(event: MessageEvent<WorkerRequest>) {
  const request = event.data;

  try {
    if (request.type === "optimize-image") {
      const optimized = await optimizeImageToWebp(request.payload);

      postResponse(
        {
          id: request.id,
          ok: true,
          type: "optimize-image",
          payload: optimized,
        },
        [optimized.buffer],
      );

      return;
    }

    if (request.type === "compress-text") {
      const compressed = await compressText(request.payload.text);

      postResponse(
        {
          id: request.id,
          ok: true,
          type: "compress-text",
          payload: compressed,
        },
        [compressed.buffer],
      );

      return;
    }

    const text = await decompressText(request.payload.buffer, request.payload.algorithm);

    postResponse({
      id: request.id,
      ok: true,
      type: "decompress-text",
      payload: {
        text,
      },
    });
  } catch (error) {
    postResponse({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown worker error",
    });
  }
}

workerScope.onmessage = (event) => {
  void handleMessage(event);
};

export {};
