type OptimizeImageRequest = {
  id: number
  type: "optimize-image"
  payload: {
    buffer: ArrayBuffer
    mimeType: string
    quality?: number
  }
}

type CompressTextRequest = {
  id: number
  type: "compress-text"
  payload: {
    text: string
  }
}

type DecompressTextRequest = {
  id: number
  type: "decompress-text"
  payload: {
    buffer: ArrayBuffer
    algorithm: string
  }
}

type WorkerRequest = OptimizeImageRequest | CompressTextRequest | DecompressTextRequest

type WorkerResponse =
  | {
      id: number
      ok: true
      type: "optimize-image"
      payload: {
        buffer: ArrayBuffer
        mimeType: string
      }
    }
  | {
      id: number
      ok: true
      type: "compress-text"
      payload: {
        algorithm: string
        buffer: ArrayBuffer
      }
    }
  | {
      id: number
      ok: true
      type: "decompress-text"
      payload: {
        text: string
      }
    }
  | {
      id: number
      ok: false
      error: string
    }

type WorkerScope = {
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

const workerScope = self as unknown as WorkerScope

function postResponse(response: WorkerResponse, transfer: Transferable[] = []) {
  workerScope.postMessage(response, transfer)
}

async function optimizeImageToWebp(
  payload: OptimizeImageRequest["payload"],
): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const sourceBlob = new Blob([payload.buffer], { type: payload.mimeType })
  const shouldConvert = sourceBlob.type.startsWith("image/") && sourceBlob.type !== "image/webp"

  if (!shouldConvert || typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    return {
      buffer: await sourceBlob.arrayBuffer(),
      mimeType: sourceBlob.type || payload.mimeType,
    }
  }

  const imageBitmap = await createImageBitmap(sourceBlob)

  try {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height)
    const context = canvas.getContext("2d", {
      alpha: true,
      desynchronized: true,
    })

    if (!context) {
      return {
        buffer: await sourceBlob.arrayBuffer(),
        mimeType: sourceBlob.type || payload.mimeType,
      }
    }

    context.drawImage(imageBitmap, 0, 0)

    const webpBlob = await canvas.convertToBlob({
      type: "image/webp",
      quality: payload.quality ?? 0.82,
    })

    return {
      buffer: await webpBlob.arrayBuffer(),
      mimeType: "image/webp",
    }
  } finally {
    imageBitmap.close()
  }
}

async function tryCompression(
  input: Uint8Array,
  algorithm: string,
): Promise<ArrayBuffer | null> {
  try {
    const compressionStream = new CompressionStream(algorithm as CompressionFormat)
    const sourceBuffer = Uint8Array.from(input).buffer
    const stream = new Blob([sourceBuffer]).stream().pipeThrough(compressionStream)
    return await new Response(stream).arrayBuffer()
  } catch {
    return null
  }
}

async function compressTextToBuffer(
  text: string,
): Promise<{ algorithm: string; buffer: ArrayBuffer }> {
  const source = new TextEncoder().encode(text)

  const preferredAlgorithms = ["br", "brotli", "gzip", "deflate"]

  for (const algorithm of preferredAlgorithms) {
    const compressed = await tryCompression(source, algorithm)
    if (compressed) {
      return {
        algorithm,
        buffer: compressed,
      }
    }
  }

  return {
    algorithm: "none",
    buffer: source.slice().buffer,
  }
}

async function decompressTextFromBuffer(payload: DecompressTextRequest["payload"]): Promise<string> {
  if (payload.algorithm === "none") {
    return new TextDecoder().decode(payload.buffer)
  }

  try {
    const decompressionStream = new DecompressionStream(payload.algorithm as CompressionFormat)
    const stream = new Blob([payload.buffer]).stream().pipeThrough(decompressionStream)
    const result = await new Response(stream).arrayBuffer()
    return new TextDecoder().decode(result)
  } catch {
    return new TextDecoder().decode(payload.buffer)
  }
}

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data

  try {
    if (request.type === "optimize-image") {
      const optimized = await optimizeImageToWebp(request.payload)

      postResponse(
        {
          id: request.id,
          ok: true,
          type: "optimize-image",
          payload: optimized,
        },
        [optimized.buffer],
      )

      return
    }

    if (request.type === "compress-text") {
      const compressed = await compressTextToBuffer(request.payload.text)

      postResponse(
        {
          id: request.id,
          ok: true,
          type: "compress-text",
          payload: compressed,
        },
        [compressed.buffer],
      )

      return
    }

    const text = await decompressTextFromBuffer(request.payload)

    postResponse({
      id: request.id,
      ok: true,
      type: "decompress-text",
      payload: {
        text,
      },
    })
  } catch (error) {
    postResponse({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown worker error",
    })
  }
}

export {}