import { afterEach, describe, expect, it, vi } from "vitest";

import { notesTrace, notesTraceError, setNotesTraceEnabled } from "./notes-trace";

const KEY = "cuervo-notes-trace";

function spyDebug() {
  return vi.spyOn(console, "debug").mockImplementation(() => {});
}

afterEach(() => vi.unstubAllGlobals());

describe("tracing is opt-in", () => {
  it("logs nothing by default", () => {
    const debug = spyDebug();
    notesTrace("scope", "message", { a: 1 });
    notesTraceError("scope", "message", new Error("x"));
    expect(debug).not.toHaveBeenCalled();
  });

  it.each(["1", "true", "on"])("is switched on by the stored value %s", (value) => {
    window.localStorage.setItem(KEY, value);
    const debug = spyDebug();
    notesTrace("scope", "message");
    expect(debug).toHaveBeenCalledOnce();
  });

  it("stays off for any other stored value", () => {
    window.localStorage.setItem(KEY, "yes");
    const debug = spyDebug();
    notesTrace("scope", "message");
    expect(debug).not.toHaveBeenCalled();
  });

  it("can be switched on and off", () => {
    const debug = spyDebug();

    setNotesTraceEnabled(true);
    expect(window.localStorage.getItem(KEY)).toBe("1");
    notesTrace("scope", "on");

    setNotesTraceEnabled(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    notesTrace("scope", "off");

    expect(debug).toHaveBeenCalledOnce();
  });
});

describe("notesTrace", () => {
  it("prefixes the scope and message, with the payload when given", () => {
    setNotesTraceEnabled(true);
    const debug = spyDebug();

    notesTrace("notes-storage", "saved");
    notesTrace("notes-storage", "saved", { id: 7 });

    expect(debug).toHaveBeenNthCalledWith(1, "[notes-trace][notes-storage] saved");
    expect(debug).toHaveBeenNthCalledWith(2, "[notes-trace][notes-storage] saved", { id: 7 });
  });
});

describe("notesTraceError", () => {
  it("expands an Error into name, message and stack", () => {
    setNotesTraceEnabled(true);
    const debug = spyDebug();
    const error = new TypeError("bad input");

    notesTraceError("scope", "failed", error);

    expect(debug).toHaveBeenCalledWith("[notes-trace][scope] failed", {
      error: { name: "TypeError", message: "bad input", stack: error.stack },
    });
  });

  it("wraps a thrown non-Error value", () => {
    setNotesTraceEnabled(true);
    const debug = spyDebug();

    notesTraceError("scope", "failed", "just a string");

    expect(debug).toHaveBeenCalledWith("[notes-trace][scope] failed", {
      error: { error: "just a string" },
    });
  });

  it("merges an object payload with the error, and wraps a primitive payload", () => {
    setNotesTraceEnabled(true);
    const debug = spyDebug();

    notesTraceError("scope", "failed", "e", { documentId: "d1" });
    notesTraceError("scope", "failed", "e", 42);

    expect(debug).toHaveBeenNthCalledWith(1, "[notes-trace][scope] failed", {
      documentId: "d1",
      error: { error: "e" },
    });
    expect(debug).toHaveBeenNthCalledWith(2, "[notes-trace][scope] failed", {
      payload: 42,
      error: { error: "e" },
    });
  });

  it("treats a null payload as a primitive", () => {
    setNotesTraceEnabled(true);
    const debug = spyDebug();

    notesTraceError("scope", "failed", "e", null);

    expect(debug).toHaveBeenCalledWith("[notes-trace][scope] failed", {
      payload: null,
      error: { error: "e" },
    });
  });
});

describe("when storage or the window is unavailable", () => {
  it("stays off if localStorage throws, and swallows write errors", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const debug = spyDebug();

    notesTrace("scope", "message");
    expect(() => setNotesTraceEnabled(true)).not.toThrow();
    expect(() => setNotesTraceEnabled(false)).not.toThrow();
    expect(debug).not.toHaveBeenCalled();
  });

  it("is inert without a window (server rendering)", () => {
    const debug = spyDebug();
    vi.stubGlobal("window", undefined);

    notesTrace("scope", "message");
    expect(() => setNotesTraceEnabled(true)).not.toThrow();

    expect(debug).not.toHaveBeenCalled();
  });
});
