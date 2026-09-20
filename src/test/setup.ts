import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

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

afterEach(() => {
  cleanup();
  server.resetHandlers();

  // Suites can opt into the `node` environment (e.g. the Web Worker), where there is no DOM.
  if (typeof window !== "undefined") {
    window.localStorage.clear();
    document.documentElement.className = "";
  }
});

afterAll(() => server.close());
