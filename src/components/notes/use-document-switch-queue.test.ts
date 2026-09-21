import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDocumentSwitchQueue } from "./use-document-switch-queue";

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useDocumentSwitchQueue", () => {
  it("returns a stable function across renders", () => {
    const { result, rerender } = renderHook(() => useDocumentSwitchQueue());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("runs operations strictly one after another, in call order", async () => {
    const { result } = renderHook(() => useDocumentSwitchQueue());
    const gate = deferred();
    const log: string[] = [];

    const first = result.current("openDocumentById", async () => {
      log.push("first:start");
      await gate.promise;
      log.push("first:end");
    });
    const second = result.current("createNoteAt", () => {
      log.push("second:start");
      return Promise.resolve();
    });

    await Promise.resolve();
    expect(log).toEqual(["first:start"]);

    gate.resolve();
    await Promise.all([first, second]);
    expect(log).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("keeps the queue moving after an operation fails", async () => {
    const { result } = renderHook(() => useDocumentSwitchQueue());

    await expect(
      result.current("openDocumentById", () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");

    let ran = false;
    await result.current("openDocumentById", () => {
      ran = true;
      return Promise.resolve();
    });
    expect(ran).toBe(true);
  });
});
