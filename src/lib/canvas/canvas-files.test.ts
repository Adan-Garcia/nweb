import { describe, expect, it } from "vitest";

import { contentFileId } from "./canvas-files";

describe("contentFileId", () => {
  it("gives the same bytes the same id, and different bytes another", async () => {
    const a = await contentFileId(new Blob(["same picture"]));
    const b = await contentFileId(new Blob(["same picture"]));
    const c = await contentFileId(new Blob(["another picture"]));

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
