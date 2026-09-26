import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

import { server } from "./server";

import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// Any network request without a handler fails the test. `data:` and `blob:` URLs are
// in-memory (fetch() is used to turn them into Blobs), so they are exempt.
beforeAll(() =>
  server.listen({
    onUnhandledRequest(request, print) {
      if (request.url.startsWith("data:") || request.url.startsWith("blob:")) {
        return;
      }

      print.error();
    },
  }),
);

/**
 * No test opens a real socket. The live channel reaches for the global `WebSocket` by
 * default, so it is replaced with one that connects to nothing and never speaks. Stubbed
 * before each test rather than once, because a suite may unstub its own globals.
 */
class InertWebSocket {
  send() {}
  close() {}
  addEventListener() {}
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", InertWebSocket);
});

afterEach(() => {
  cleanup();
  server.resetHandlers();

  // Suites can opt into the `node` environment (e.g. the Web Worker), where there is no DOM.
  // A node suite may also stub a partial `window` for a storage module under test, so the
  // two globals are checked separately rather than assumed to arrive together.
  if (typeof window !== "undefined") {
    window.localStorage?.clear();
  }

  if (typeof document !== "undefined") {
    document.documentElement.className = "";
  }
});

afterAll(() => server.close());
