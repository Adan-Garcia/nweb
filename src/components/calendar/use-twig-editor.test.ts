import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { withSharePaths } from "@/lib/workspace-tree";
import { makeBranch, makeFlight, makeSnapshot, makeWing } from "@/test/workspace-fixtures";

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
});
