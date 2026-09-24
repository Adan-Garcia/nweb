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
        Promise.all(
          names.filter((name) => !KNOWN_CACHES.includes(name)).map((name) => caches.delete(name)),
        ),
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

/*
 * A reminder arriving while the app is closed.
 *
 * The payload says how many things are due and when, and nothing about what: the server
 * that composed it holds ciphertext and no key. Reading a title here is not possible
 * either — this worker has no access to the page's key, and none at all while the
 * workspace is locked — so the notification says what is true and the app fills in the
 * rest when it is opened.
 */
self.addEventListener("push", (event) => {
  let due = { count: 1, dueAt: Date.now() };

  try {
    due = { ...due, ...(event.data ? event.data.json() : {}) };
  } catch {
    // A payload from something that is not this server. The generic text still applies.
  }

  const at = new Date(due.dueAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const body =
    due.count === 1 ? `Something is due at ${at}.` : `${due.count} things are due at ${at}.`;

  event.waitUntil(
    self.registration.showNotification("Cuervo Planner", {
      body,
      tag: "cuervo-due",
      data: { url: "/calendar" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url ?? "/";

  // Focus a tab that is already open before opening another: someone with the app up does
  // not want a second copy of it.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => new URL(client.url).pathname === url);

      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
