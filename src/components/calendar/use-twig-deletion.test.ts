import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { twigSchema } from "@/lib/twigs/twig-model";

import { useTwigDeletion } from "./use-twig-deletion";

const twig = twigSchema.parse({
  id: "t1",
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  branchId: "b",
  title: "Quiz",
  seriesId: "s1",
});

describe("useTwigDeletion", () => {
  it("holds a task until it is answered, then deletes as far as the answer says", async () => {
    const deleteTwig = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useTwigDeletion(deleteTwig));

    act(() => result.current.request(twig));
    expect(result.current.pending).toBe(twig);
    expect(deleteTwig).not.toHaveBeenCalled();

    await act(() => result.current.confirm("following"));

    expect(deleteTwig).toHaveBeenCalledWith(twig, "following");
    expect(result.current.pending).toBeNull();
  });

  it("deletes nothing when cancelled, or when nothing is waiting", async () => {
    const deleteTwig = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useTwigDeletion(deleteTwig));

    act(() => result.current.request(twig));
    act(() => result.current.cancel());
    await act(() => result.current.confirm("all"));

    expect(result.current.pending).toBeNull();
    expect(deleteTwig).not.toHaveBeenCalled();
  });
});
