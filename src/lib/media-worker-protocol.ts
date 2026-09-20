// Message contract between the main thread (media-worker-client) and
// src/workers/media-worker.ts. Types only: safe to import from the worker.

export type OptimizeImageRequest = {
  id: number;
  type: "optimize-image";
  payload: {
    buffer: ArrayBuffer;
    mimeType: string;
    quality?: number;
  };
};

export type CompressTextRequest = {
  id: number;
  type: "compress-text";
  payload: {
    text: string;
  };
};

export type DecompressTextRequest = {
  id: number;
  type: "decompress-text";
  payload: {
    buffer: ArrayBuffer;
    algorithm: string;
  };
};

export type WorkerRequest =
  | OptimizeImageRequest
  | CompressTextRequest
  | DecompressTextRequest;

export type WorkerResponse =
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
