import { describe, expect, it, vi } from "vitest";

import {
  defaultServerUrl,
  normalizeServerUrl,
  readServerUrl,
  resetServerUrl,
  SERVER_URL_KEY,
  writeServerUrl,
} from "./server-url";

const BUILD = { VITE_API_URL: "https://build.example.com/" };

describe("normalizeServerUrl", () => {
  it("keeps http(s) addresses, without a trailing slash", () => {
    expect(normalizeServerUrl("https://sync.example.org/")).toBe("https://sync.example.org");
    expect(normalizeServerUrl("  http://localhost:8787 ")).toBe("http://localhost:8787");
    expect(normalizeServerUrl("https://example.org/cuervo/")).toBe("https://example.org/cuervo");
  });

  it("refuses plain http anywhere but this machine", () => {
    // A session token and a proof of the passphrase travel to this address. Over plain
    // http anyone on the network reads both, and could answer in the server's place.
    expect(normalizeServerUrl("http://sync.example.org")).toBeNull();
    expect(normalizeServerUrl("http://192.168.1.20:8787")).toBeNull();
    expect(normalizeServerUrl("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
    expect(normalizeServerUrl("http://[::1]:8787")).toBe("http://[::1]:8787");
  });

  it("refuses anything that is not one", () => {
    expect(normalizeServerUrl(null)).toBeNull();
    expect(normalizeServerUrl(undefined)).toBeNull();
    expect(normalizeServerUrl("   ")).toBeNull();
    expect(normalizeServerUrl("not a url")).toBeNull();
    expect(normalizeServerUrl("ftp://example.org")).toBeNull();
    expect(normalizeServerUrl("https://user:secret@sync.example.org")).toBeNull();
  });
});

describe("the chosen server", () => {
  it("falls back to the build's server until one is chosen", () => {
    expect(defaultServerUrl(BUILD)).toBe("https://build.example.com");
    expect(readServerUrl(BUILD)).toBe("https://build.example.com");
    expect(readServerUrl({})).toBeNull();
  });

  it("remembers a chosen server, or the choice of none, over the build's", () => {
    expect(writeServerUrl("https://mine.example.org/")).toBe(true);
    expect(readServerUrl(BUILD)).toBe("https://mine.example.org");

    expect(writeServerUrl(null)).toBe(true);
    expect(readServerUrl(BUILD)).toBeNull();

    resetServerUrl();
    expect(readServerUrl(BUILD)).toBe("https://build.example.com");
  });

  it("refuses an unusable address and keeps the last choice", () => {
    writeServerUrl("https://mine.example.org");

    expect(writeServerUrl("javascript:alert(1)")).toBe(false);
    expect(readServerUrl(BUILD)).toBe("https://mine.example.org");
  });

  it("ignores a mangled stored value", () => {
    window.localStorage.setItem(SERVER_URL_KEY, "{not json");
    expect(readServerUrl(BUILD)).toBe("https://build.example.com");

    window.localStorage.setItem(SERVER_URL_KEY, JSON.stringify({ url: 42 }));
    expect(readServerUrl(BUILD)).toBe("https://build.example.com");
  });

  it("survives storage that refuses to be written or cleared", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(writeServerUrl("https://mine.example.org")).toBe(false);
    expect(() => resetServerUrl()).not.toThrow();

    setItem.mockRestore();
    removeItem.mockRestore();
  });
});
