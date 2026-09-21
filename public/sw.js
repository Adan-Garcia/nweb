/*
 * Cuervo Planner's service worker.
 *
 * Written by hand rather than generated, so it needs no build step and no new dependency
 * (CLAUDE.md section 9). It needs no precache manifest either, because of how Vite names
 * things:
 *
 *   - Everything under /assets/ is content-hashed, so a given URL's bytes never change.
 *     Those are cached forever on first use and served from the cache after that.
 *   - The HTML document is not hashed, so it is fetched from the network first and only
 *     falls back to the cache when there is none. That is what lets a new deploy be picked
 *     up rather than being pinned to whatever was cached first.
 *
 * A route whose chunk has never been fetched would not be in the cache either, so the app
 * asks the browser to import the pages it has not opened once it is idle (see
 * `lib/route-warmup.ts`). Those requests arrive here like any other and are cached the
 * same way, which is why this file needs no precache manifest to cover them.
 */

const SHELL_CACHE = "cuervo-shell-v1";
const ASSET_CACHE = "cuervo-assets-v1";
const KNOWN_CACHES = [SHELL_CACHE, ASSET_CACHE];

/** Fetched on install so the very first offline start has something to render. */
const SHELL_URLS = ["/", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individually, so one missing file cannot fail the whole install.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => !KNOWN_CACHES.includes(name)).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Content-hashed, so the bytes behind this URL will never change. */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/assets/");
}

async function cacheFirst(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response.ok) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
  }

  return response;
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(fallbackUrl ?? request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await caches.match(fallbackUrl ?? request);

    if (cached) {
      return cached;
    }

    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Another origin's response is not ours to store.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Every route renders from the same document, so they all fall back to the cached "/".
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
