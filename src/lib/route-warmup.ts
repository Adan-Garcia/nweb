/**
 * Fetches the route chunks the user has not opened yet, once the app is idle.
 *
 * The service worker caches what it serves, so until now a route that had never been
 * visited was not in the cache and opening it offline failed — the one hole left in "it
 * works with no network". A precache manifest would close it too, but that means a build
 * step and a plugin for a worker that is deliberately hand-written (CLAUDE.md section 9).
 * Asking the browser to import each lazy page is the same effect with no new machinery:
 * the requests go through the worker like any other, and land in the asset cache.
 *
 * It waits for idle so it never competes with the page the user actually asked for, and
 * it does not run at all when the browser says the connection is metered. Offline support
 * is not worth spending someone's data plan on chunks they may never open.
 */
export type RouteLoader = () => Promise<unknown>;

const IDLE_TIMEOUT_MS = 5_000;
const FALLBACK_DELAY_MS = 2_000;

type NavigatorWithConnection = Navigator & { connection?: { saveData?: boolean } };

/** Only reached once `window` is known to exist, so `navigator` does too. */
function prefersLessData() {
  return (navigator as NavigatorWithConnection).connection?.saveData === true;
}

export function warmRoutes(
  loaders: readonly RouteLoader[],
  { isProduction }: { isProduction: boolean } = { isProduction: import.meta.env.PROD },
): void {
  if (!isProduction || typeof window === "undefined" || prefersLessData()) {
    return;
  }

  const run = () => {
    for (const load of loaders) {
      // A chunk that will not load is exactly the situation this is trying to improve on,
      // and there is nothing to tell the user about it.
      void load().catch(() => undefined);
    }
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return;
  }

  window.setTimeout(run, FALLBACK_DELAY_MS);
}
