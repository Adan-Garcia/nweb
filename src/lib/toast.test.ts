import { afterEach, describe, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });

  return { toast };
});

vi.mock("sonner", () => sonner);

import { notifyError, notifyInfo, notifySuccess } from "./toast";

afterEach(() => vi.clearAllMocks());

describe("toast", () => {
  it("reports success, failure and news through one place", () => {
    notifySuccess("Saved", "just now");
    notifyError("Could not export");
    notifyInfo("Synced");

    expect(sonner.toast.success).toHaveBeenCalledWith("Saved", { description: "just now" });
    // A failure stays up longer: it is the one someone may need to read twice.
    expect(sonner.toast.error).toHaveBeenCalledWith("Could not export", {
      description: undefined,
      duration: 8000,
    });
    expect(sonner.toast).toHaveBeenCalledWith("Synced", { description: undefined });
  });
});
