import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

import { DEFAULT_PREFERENCES } from "@/lib/preferences/preferences-model";
import { useCommandPaletteStore } from "@/stores/use-command-palette-store";
import { usePreferencesStore } from "@/stores/use-preferences-store";

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

/** jsdom lays nothing out, so there is nothing to observe; cmdk only needs the API to exist. */
class InertResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", InertWebSocket);

  // Checked by `Element` rather than `window`: a node suite may stub a partial window.
  if (typeof Element !== "undefined") {
    vi.stubGlobal("ResizeObserver", InertResizeObserver);
    // cmdk scrolls the highlighted item into view; jsdom has no layout to scroll.
    if (!("scrollIntoView" in Element.prototype)) {
      Object.defineProperty(Element.prototype, "scrollIntoView", {
        value: () => undefined,
        configurable: true,
        writable: true,
      });
    }
  }
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
    document.documentElement.removeAttribute("style");

    for (const name of ["theme", "accent", "density", "fontSize"]) {
      delete document.documentElement.dataset[name];
    }
  }

  // The stores are module state, so they would otherwise carry one test's theme (or a
  // stubbed action) into the next test of the same file.
  usePreferencesStore.setState({
    ...usePreferencesStore.getInitialState(),
    preferences: DEFAULT_PREFERENCES,
  });
  useCommandPaletteStore.setState(useCommandPaletteStore.getInitialState());
});

afterAll(() => server.close());
