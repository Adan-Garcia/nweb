import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono } from "hono";

/**
 * The built app, served beside the API, so a single tunnel exposes one origin: no CORS,
 * no second host, and the app finds its server by being on it (`VITE_API_URL=same-origin`).
 *
 * Optional: a deployment that hosts the app elsewhere leaves `STATIC_DIR` unset, and this is
 * never mounted. `serveStatic` refuses `..` and doubled slashes itself, so nothing outside
 * the directory can be asked for.
 */
const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * Everything under `/assets/` is content-hashed, so its bytes never change and it is cached
 * for good. Everything else — the document, the service worker, the manifest — is revalidated
 * every time, or a deploy would be pinned behind whatever a browser fetched first.
 */
function cacheControlFor(path: string): string {
  return path.startsWith("/assets/") ? IMMUTABLE : "no-cache";
}

const isApi = (context: Context) => context.req.path.startsWith("/v1/");

export function staticAppRoutes(directory: string) {
  const routes = new Hono();
  const files = serveStatic({ root: directory });
  // Every route of a single-page app is the same document; the router takes it from there.
  const document = serveStatic({ root: directory, path: "index.html" });

  // Set before serving: the adapter builds its response from the context's headers, and
  // anything added after that (its `onFound`) arrives too late to be sent.
  routes.get("*", async (context, next) => {
    if (isApi(context)) {
      return next();
    }

    context.header("cache-control", cacheControlFor(context.req.path));

    return files(context, next);
  });
  routes.get("*", async (context, next) => {
    // A missing asset is a 404, not the document: a script tag handed HTML fails confusingly.
    if (isApi(context) || context.req.path.startsWith("/assets/")) {
      return next();
    }

    context.header("cache-control", "no-cache");

    return document(context, next);
  });

  return routes;
}
