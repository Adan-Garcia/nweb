import { describe, expect, it } from "vitest";

import { contentFileId, portableFile } from "./canvas-files";

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

describe("portableFile", () => {
  const base = { id: "f", mimeType: "text/plain", created: 1 };

  it("keeps a stored file's data URL and recovers its bytes from it", async () => {
    const file = await portableFile({ ...base, url: "data:text/plain;base64,aGVsbG8=" });

    expect(file?.url).toBe("data:text/plain;base64,aGVsbG8=");
    expect(await file?.blob?.text()).toBe("hello");
  });

  it("swaps a new file's object URL for a data URL of its bytes", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const file = await portableFile({ ...base, url: "blob:http://localhost/1", blob });

    expect(file?.url).toBe("data:text/plain;base64,aGVsbG8=");
    expect(file?.blob).toBe(blob);
  });

  it("gives up on a file whose bytes cannot be had", async () => {
    expect(await portableFile({ ...base, url: "blob:http://localhost/1" })).toBeNull();
  });
});
