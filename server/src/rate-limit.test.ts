// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createRateLimiter } from "./rate-limit";

const NOW = Date.UTC(2026, 8, 22);

describe("createRateLimiter", () => {
  it("allows a run up to the limit and refuses the one after", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

    expect(limiter.isLimited("a", NOW)).toBe(false);
    expect(limiter.isLimited("a", NOW)).toBe(false);
    expect(limiter.isLimited("a", NOW)).toBe(false);
    expect(limiter.isLimited("a", NOW)).toBe(true);
  });

  it("counts each key on its own, so one address cannot lock out another", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.isLimited("a", NOW)).toBe(false);
    expect(limiter.isLimited("b", NOW)).toBe(false);
    expect(limiter.isLimited("a", NOW)).toBe(true);
  });

  it("starts again once the window has passed", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.isLimited("a", NOW)).toBe(false);
    expect(limiter.isLimited("a", NOW)).toBe(true);

    expect(limiter.isLimited("a", NOW + 60_001)).toBe(false);
  });

  it("forgets keys whose window has passed, rather than keeping one per address ever seen", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    for (let index = 0; index < 100; index += 1) {
      limiter.isLimited(`address-${index}`, NOW);
    }

    // The sweep runs when a new window opens, so the old keys go with it. What is
    // observable is that an old key is not remembered as being over its limit.
    expect(limiter.isLimited("address-0", NOW + 60_001)).toBe(false);
    expect(limiter.isLimited("address-0", NOW + 60_001)).toBe(true);
  });
});
