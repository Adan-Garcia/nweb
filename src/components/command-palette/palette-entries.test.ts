import { describe, expect, it } from "vitest";

import { makeEntry, makeSnapshot, makeTwig } from "@/test/workspace-fixtures";

import { noteEntries, taskEntries } from "./palette-entries";

const snapshot = makeSnapshot();

describe("noteEntries", () => {
  it("labels a note by its title and course, and links to it", () => {
    const [entry] = noteEntries(snapshot, [
      makeEntry({ id: "n 1", feather: "Lecture 3", createdMode: "spatial" }),
    ]);

    expect(entry).toEqual({
      id: "note:n 1",
      label: "Lecture 3",
      hint: "Biology 101",
      keywords: ["Biology 101", "canvas"],
      href: "/notes?note=n%201",
    });
  });

  it("leaves the course out when it cannot be read here", () => {
    const [entry] = noteEntries(snapshot, [makeEntry({ branchId: "elsewhere" })]);

    expect(entry.hint).toBe("");
    expect(entry.keywords).toContain("text");
  });
});

describe("taskEntries", () => {
  it("lists what is still to do, soonest first, dated or not", () => {
    const entries = taskEntries(snapshot, [
      makeTwig({ id: "late", title: "Later", dueDate: "2026-05-02" }),
      makeTwig({ id: "done", title: "Done", status: "complete" }),
      makeTwig({ id: "undated", title: "Someday", dueDate: null, branchId: "elsewhere" }),
      makeTwig({ id: "soon", title: "Sooner", dueDate: "2026-05-01" }),
    ]);

    expect(entries.map((entry) => entry.label)).toEqual(["Sooner", "Later", "Someday"]);
    expect(entries[0]).toMatchObject({
      hint: "Biology 101 · 2026-05-01",
      href: "/board?task=soon",
    });
    expect(entries[2].hint).toBe("");
  });
});
