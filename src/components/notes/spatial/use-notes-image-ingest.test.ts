import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaWorkerClient } from "@/lib/media/media-worker-client";

import type { NotesMode } from "../types";
import { useNotesImageIngest } from "./use-notes-image-ingest";

function dropOnto(host: HTMLElement, files: File[]) {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files } });
  host.dispatchEvent(event);
}

function setup(mode: NotesMode) {
  const host = document.createElement("div");
  document.body.append(host);
  const hook = renderHook(
    ({ currentMode }) =>
      useNotesImageIngest({
        // No Worker in jsdom, so optimizeImageFile passes the file through.
        mediaWorker: new MediaWorkerClient(),
        spatialHostRef: { current: host },
        mode: currentMode,
      }),
    { initialProps: { currentMode: mode } },
  );
  return { host, ...hook };
}

const png = () => new File(["p"], "a.png", { type: "image/png" });
const text = () => new File(["t"], "a.txt", { type: "text/plain" });

describe("useNotesImageIngest", () => {
  it("counts image files dropped onto the spatial editor", async () => {
    const { host, result } = setup("spatial");
    expect(result.current.optimizedAssetCount).toBe(0);

    act(() => dropOnto(host, [png(), png(), text()]));

    await waitFor(() => expect(result.current.optimizedAssetCount).toBe(2));
  });

  it("ignores drops that carry no images", async () => {
    const { host, result } = setup("spatial");

    act(() => dropOnto(host, [text()]));
    act(() => dropOnto(host, []));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.optimizedAssetCount).toBe(0);
  });

  it("does not listen for drops in linear mode, and starts once spatial mode is entered", async () => {
    const { host, result, rerender } = setup("linear");

    act(() => dropOnto(host, [png()]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.optimizedAssetCount).toBe(0);

    rerender({ currentMode: "spatial" });
    act(() => dropOnto(host, [png()]));
    await waitFor(() => expect(result.current.optimizedAssetCount).toBe(1));
  });

  it("stops listening when unmounted", async () => {
    const { host, result, unmount } = setup("spatial");
    unmount();

    act(() => dropOnto(host, [png()]));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.optimizedAssetCount).toBe(0);
  });
});

describe("useNotesImageIngest: pasting", () => {
  afterEach(() => vi.unstubAllGlobals());

  // jsdom has neither ClipboardEvent nor DataTransfer; these are the two members the handler reads.
  function pasteEvent(files: File[]) {
    vi.stubGlobal(
      "DataTransfer",
      class {
        files: File[] = [];
      },
    );
    vi.stubGlobal(
      "ClipboardEvent",
      class extends Event {
        clipboardData: unknown;
        constructor(type: string, init?: { clipboardData?: unknown }) {
          super(type);
          this.clipboardData = init?.clipboardData ?? null;
        }
      },
    );
    const clipboardData = new DataTransfer();
    Object.defineProperty(clipboardData, "files", { value: files });
    return new ClipboardEvent("paste", { clipboardData });
  }

  it("counts pasted images, and never swallows the paste", async () => {
    const { result } = setup("spatial");

    let handled: boolean | Promise<boolean> = true;
    act(() => {
      handled = result.current.handleSpatialPaste({}, pasteEvent([png(), text(), png()]));
    });

    expect(handled).toBe(false);
    await waitFor(() => expect(result.current.optimizedAssetCount).toBe(2));
  });

  it("ignores a paste with no images", async () => {
    const { result } = setup("spatial");

    act(() => {
      void result.current.handleSpatialPaste({}, pasteEvent([text()]));
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.optimizedAssetCount).toBe(0);
  });

  it("ignores a paste that has no clipboard data", () => {
    const { result } = setup("spatial");
    expect(result.current.handleSpatialPaste({}, null)).toBe(false);
  });
});
