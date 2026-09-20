import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaWorkerClient, createMediaWorkerClient } from "./media-worker-client";
import type { WorkerRequest, WorkerResponse } from "./media-worker-protocol";

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: { request: WorkerRequest; transfer: Transferable[] }[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: WorkerRequest, transfer: Transferable[] = []) {
    this.posted.push({ request, transfer });
  }

  terminate() {
    this.terminated = true;
  }

  reply(response: WorkerResponse) {
    this.onmessage?.(new MessageEvent("message", { data: response }));
  }

  lastRequest() {
    return this.posted[this.posted.length - 1].request;
  }
}

function withWorker() {
  vi.stubGlobal("Worker", FakeWorker);
  const client = createMediaWorkerClient();
  return { client, worker: FakeWorker.instances[FakeWorker.instances.length - 1] };
}

beforeEach(() => {
  FakeWorker.instances = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("without a Worker implementation", () => {
  it("compresses to raw utf-8 bytes with algorithm 'none' and reads them back", async () => {
    const client = new MediaWorkerClient();
    const result = await client.compressText("héllo");

    expect(result.algorithm).toBe("none");
    expect(await client.decompressText(result.bytes, result.algorithm)).toBe("héllo");
  });

  it("returns non-image and webp blobs unchanged", async () => {
    const client = new MediaWorkerClient();
    const text = new Blob(["t"], { type: "text/plain" });
    const webp = new Blob(["w"], { type: "image/webp" });
    expect(await client.optimizeImageBlob(text)).toBe(text);
    expect(await client.optimizeImageBlob(webp)).toBe(webp);
  });

  it("falls back to main-thread conversion (unchanged when unsupported)", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const png = new Blob(["p"], { type: "image/png" });
    expect(await new MediaWorkerClient().optimizeImageBlob(png)).toBe(png);
  });

  it("disposing a workerless client is harmless", () => {
    expect(() => new MediaWorkerClient().dispose()).not.toThrow();
  });
});

describe("with a Worker", () => {
  it("sends compress-text and resolves with the worker's bytes", async () => {
    const { client, worker } = withWorker();
    const pending = client.compressText("hello");

    expect(worker.lastRequest()).toMatchObject({
      type: "compress-text",
      payload: { text: "hello" },
    });
    worker.reply({
      id: worker.lastRequest().id,
      ok: true,
      type: "compress-text",
      payload: { algorithm: "gzip", buffer: new Uint8Array([1, 2, 3]).buffer },
    });

    const result = await pending;
    expect(result.algorithm).toBe("gzip");
    expect(Array.from(result.bytes)).toEqual([1, 2, 3]);
  });

  it("correlates concurrent requests by id", async () => {
    const { client, worker } = withWorker();
    const first = client.compressText("a");
    const second = client.compressText("b");
    const [a, b] = worker.posted.map((entry) => entry.request.id);

    expect(a).not.toBe(b);
    worker.reply({
      id: b,
      ok: true,
      type: "compress-text",
      payload: { algorithm: "gzip", buffer: new Uint8Array([2]).buffer },
    });
    worker.reply({
      id: a,
      ok: true,
      type: "compress-text",
      payload: { algorithm: "gzip", buffer: new Uint8Array([1]).buffer },
    });

    expect(Array.from((await first).bytes)).toEqual([1]);
    expect(Array.from((await second).bytes)).toEqual([2]);
  });

  it("rejects when the worker reports an error", async () => {
    const { client, worker } = withWorker();
    const pending = client.compressText("x");
    worker.reply({ id: worker.lastRequest().id, ok: false, error: "boom" });
    await expect(pending).rejects.toThrow("boom");
  });

  it("falls back to raw bytes if the worker answers with the wrong response type", async () => {
    const { client, worker } = withWorker();
    const pending = client.compressText("hi");
    worker.reply({
      id: worker.lastRequest().id,
      ok: true,
      type: "decompress-text",
      payload: { text: "?" },
    });

    const result = await pending;
    expect(result.algorithm).toBe("none");
    expect(Array.from(result.bytes)).toEqual(Array.from(new TextEncoder().encode("hi")));
  });

  it("ignores responses for unknown request ids", () => {
    const { worker } = withWorker();
    expect(() => worker.reply({ id: 999, ok: false, error: "stale" })).not.toThrow();
  });

  it("decompresses via the worker and transfers a copy of the bytes", async () => {
    const { client, worker } = withWorker();
    const source = new Uint8Array([9, 9]);
    const pending = client.decompressText(source, "gzip");

    const [{ request, transfer }] = worker.posted;
    expect(request).toMatchObject({ type: "decompress-text", payload: { algorithm: "gzip" } });
    expect(transfer).toHaveLength(1);
    expect(source.byteLength).toBe(2);

    worker.reply({
      id: request.id,
      ok: true,
      type: "decompress-text",
      payload: { text: "restored" },
    });
    expect(await pending).toBe("restored");
  });

  it("decodes locally, without a round trip, for algorithm 'none'", async () => {
    const { client, worker } = withWorker();
    expect(await client.decompressText(new TextEncoder().encode("plain"), "none")).toBe("plain");
    expect(worker.posted).toHaveLength(0);
  });

  it("decodes locally when the worker answers decompression with the wrong type", async () => {
    const { client, worker } = withWorker();
    const pending = client.decompressText(new TextEncoder().encode("raw"), "gzip");
    worker.reply({
      id: worker.lastRequest().id,
      ok: true,
      type: "compress-text",
      payload: { algorithm: "gzip", buffer: new ArrayBuffer(0) },
    });
    expect(await pending).toBe("raw");
  });

  it("rejects every in-flight request when the worker crashes", async () => {
    const { client, worker } = withWorker();
    const first = client.compressText("a");
    const second = client.compressText("b");

    worker.onerror?.(new ErrorEvent("error", { message: "worker died" }));

    await expect(first).rejects.toThrow("worker died");
    await expect(second).rejects.toThrow("worker died");
  });

  it("uses a default message when the crash event has none", async () => {
    const { client, worker } = withWorker();
    const pending = client.compressText("a");
    worker.onerror?.(new ErrorEvent("error"));
    await expect(pending).rejects.toThrow("Media worker crashed");
  });

  it("terminates on dispose and then works without a worker", async () => {
    const { client, worker } = withWorker();
    client.dispose();

    expect(worker.terminated).toBe(true);
    expect((await client.compressText("after")).algorithm).toBe("none");
  });

  it("uses the worker's webp output for images", async () => {
    const { client, worker } = withWorker();
    const pending = client.optimizeImageBlob(new Blob(["png"], { type: "image/png" }), 0.7);

    // The request is posted after the blob is read asynchronously.
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(worker.lastRequest()).toMatchObject({
      type: "optimize-image",
      payload: { mimeType: "image/png", quality: 0.7 },
    });
    worker.reply({
      id: worker.lastRequest().id,
      ok: true,
      type: "optimize-image",
      payload: { buffer: new Uint8Array([5]).buffer, mimeType: "image/webp" },
    });

    expect((await pending).type).toBe("image/webp");
  });

  it("keeps the original image when the worker fails and conversion is unsupported", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const { client, worker } = withWorker();
    const png = new Blob(["png"], { type: "image/png" });
    const pending = client.optimizeImageBlob(png);

    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    worker.reply({ id: worker.lastRequest().id, ok: false, error: "no codec" });

    expect(await pending).toBe(png);
  });

  it("renames a file to .webp only when it was actually converted", async () => {
    const { client, worker } = withWorker();
    const file = new File(["png"], "photo.png", { type: "image/png", lastModified: 123 });
    const pending = client.optimizeImageFile(file);

    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    worker.reply({
      id: worker.lastRequest().id,
      ok: true,
      type: "optimize-image",
      payload: { buffer: new Uint8Array([5]).buffer, mimeType: "image/webp" },
    });

    const optimized = await pending;
    expect(optimized.name).toBe("photo.webp");
    expect(optimized.type).toBe("image/webp");
    expect(optimized.lastModified).toBe(123);
  });

  it("keeps the file name when no conversion happened", async () => {
    const client = new MediaWorkerClient();
    const file = new File(["t"], "notes.txt", { type: "text/plain" });
    expect((await client.optimizeImageFile(file)).name).toBe("notes.txt");
  });
});
