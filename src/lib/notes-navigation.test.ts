import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readExpandedGroups,
  readNotesNavigationMode,
  writeExpandedGroups,
  writeNotesNavigationMode,
} from "./notes-navigation";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Storage a browser has blocked: every access throws rather than returning null. */
function blockStorage() {
  vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
    throw new Error("storage is blocked");
  });
  vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
    throw new Error("storage is blocked");
  });
}

describe("the navigation mode", () => {
  it("round-trips", () => {
    writeNotesNavigationMode("tree");

    expect(readNotesNavigationMode()).toBe("tree");
  });

  it("falls back to the path bar for a value nothing wrote", () => {
    window.localStorage.setItem("cuervo-notes-navigation", "carousel");

    expect(readNotesNavigationMode()).toBe("path");
  });

  it("survives storage being blocked, because a preference is not worth a crash", () => {
    blockStorage();

    expect(readNotesNavigationMode()).toBe("path");
    expect(() => {
      writeNotesNavigationMode("tree");
    }).not.toThrow();
  });
});

describe("the expanded groups", () => {
  it("round-trip", () => {
    writeExpandedGroups(["wing:1", "branch:2"]);

    expect(readExpandedGroups()).toEqual(["wing:1", "branch:2"]);
  });

  it("start empty when nothing has been written", () => {
    expect(readExpandedGroups()).toEqual([]);
  });

  it("ignore a stored value that is not a list of keys", () => {
    window.localStorage.setItem("cuervo-notes-expanded", '{"not":"a list"}');
    expect(readExpandedGroups()).toEqual([]);

    window.localStorage.setItem("cuervo-notes-expanded", "not json at all");
    expect(readExpandedGroups()).toEqual([]);
  });

  it("drop entries that are not keys, rather than the whole list", () => {
    window.localStorage.setItem("cuervo-notes-expanded", '["wing:1", 7, null, "branch:2"]');

    expect(readExpandedGroups()).toEqual(["wing:1", "branch:2"]);
  });

  it("survive storage being blocked", () => {
    blockStorage();

    expect(readExpandedGroups()).toEqual([]);
    expect(() => {
      writeExpandedGroups(["wing:1"]);
    }).not.toThrow();
  });
});
