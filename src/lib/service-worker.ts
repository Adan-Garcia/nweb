/**
 * Registers the service worker that makes the app installable and lets it start with no
 * network. It is deliberately quiet: failing to register costs offline support and nothing
 * else, so it must never take the app down with it.
 *
 * Only in a production build. In dev, Vite serves modules unbundled and a worker caching
 * them would serve yesterday's code back after an edit.
 */
export async function registerServiceWorker(
  { isProduction }: { isProduction: boolean } = { isProduction: import.meta.env.PROD },
): Promise<ServiceWorkerRegistration | null> {
  if (!isProduction || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}
