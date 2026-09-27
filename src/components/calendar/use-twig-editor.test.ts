import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { withSharePaths } from "@/lib/hierarchy/workspace-tree";
import {
  makeBranch,
  makeFlight,
  makeSnapshot,
  makeTwig,
  makeWing,
} from "@/test/workspace-fixtures";

import { useTwigEditor } from "./use-twig-editor";

describe("useTwigEditor", () => {
  it("offers only courses a task can be filed under, not names on a shared path", () => {
    const own = makeSnapshot({
      wings: [makeWing({ id: "w" })],
      flights: [makeFlight({ id: "f", wingId: "w", name: "Fall 2026" })],
      branches: [makeBranch({ id: "mine", flightId: "f", name: "Physics" })],
      nests: [],
    });
    const snapshot = withSharePaths(own, {
      wings: [],
      flights: [],
      branches: [makeBranch({ id: "theirs", flightId: "f", name: "Somebody's course" })],
      nests: [],
    });

    const { result } = renderHook(() => useTwigEditor({ snapshot, saveTwig: vi.fn() }));

    expect(result.current.branchOptions.map((branch) => branch.id)).toEqual(["mine"]);
  });

  it("offers no course shared to read, and opens no form for a task in one", () => {
    const snapshot = makeSnapshot({
      wings: [makeWing({ id: "w" })],
      flights: [makeFlight({ id: "f", wingId: "w" })],
      branches: [
        makeBranch({ id: "mine", flightId: "f", name: "Physics" }),
        makeBranch({ id: "theirs", flightId: "f", name: "Their course" }),
      ],
      nests: [],
      readOnly: new Set(["theirs"]),
    });

    const { result } = renderHook(() => useTwigEditor({ snapshot, saveTwig: vi.fn() }));

    expect(result.current.branchOptions.map((branch) => branch.id)).toEqual(["mine"]);

    act(() => result.current.openEdit(makeTwig({ branchId: "theirs" })));
    expect(result.current.isOpen).toBe(false);

    act(() => result.current.openEdit(makeTwig({ branchId: "mine" })));
    expect(result.current.isOpen).toBe(true);
  });
});
