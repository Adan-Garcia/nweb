/**
 * A fixed window per key, held in this process.
 *
 * It is not a distributed limiter and does not pretend to be: run two instances and an
 * attacker gets two windows. What it stops is the thing worth stopping first — one client
 * working through a list of addresses or proofs against one process — and it costs no
 * dependency to do it. A shared store is the upgrade, and the shape here does not change
 * when it arrives.
 */
export type RateLimiter = {
  /** True when this key is over its allowance and the request should be refused. */
  isLimited: (key: string, now?: number) => boolean;
};

export function createRateLimiter({
  limit,
  windowMs,
}: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    isLimited(key, now = Date.now()) {
      const current = windows.get(key);

      if (!current || current.resetAt <= now) {
        // Expired windows are dropped as they are found, so a long-running process does
        // not accumulate a key per address anyone has ever tried.
        for (const [existing, window] of windows) {
          if (window.resetAt <= now) {
            windows.delete(existing);
          }
        }

        windows.set(key, { count: 1, resetAt: now + windowMs });
        return false;
      }

      current.count += 1;

      return current.count > limit;
    },
  };
}
