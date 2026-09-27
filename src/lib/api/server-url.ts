import { z } from "zod";

/**
 * Which server this device talks to, if any.
 *
 * A build can name one (`VITE_API_URL`), and a person can pick another in Settings — their
 * own, self-hosted, or none at all. The choice sits in `localStorage` because it is needed
 * synchronously by the first request and holds nothing secret: a URL is public by nature.
 *
 * Stored as `{ url }` so that "no server" (null) is a choice distinct from "never chosen",
 * which falls back to the build's default.
 */
export const SERVER_URL_KEY = "cuervo-server-url";

const choiceSchema = z.object({ url: z.string().nullable() });

type Env = { VITE_API_URL?: string };

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * A usable base URL, or null: https (or http to this machine only), no credentials, no
 * trailing slash.
 */
export function normalizeServerUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    // Plain http only to this machine, for running a server locally. Anywhere else a
    // session token and a proof of the passphrase would cross the network readable, and
    // anyone on the way could answer in the server's place.
    const isThisMachine = LOOPBACK_HOSTS.has(url.hostname);
    const isSecure = url.protocol === "https:" || (url.protocol === "http:" && isThisMachine);

    // Credentials in the address would ride along in every request and every log line.
    if (!isSecure || url.username || url.password) {
      return null;
    }

    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Built to be served by its own server (`STATIC_DIR` on the server): the API is wherever the
 * app was loaded from, which is not known until it is — the same build works on any domain
 * a tunnel gives it.
 */
export const SAME_ORIGIN = "same-origin";

/** What the build was pointed at, which is also what "reset" goes back to. */
export function defaultServerUrl(
  env: Env = import.meta.env,
  origin: string = window.location.origin,
): string | null {
  return normalizeServerUrl(env.VITE_API_URL?.trim() === SAME_ORIGIN ? origin : env.VITE_API_URL);
}

export function readServerUrl(env: Env = import.meta.env): string | null {
  try {
    const raw = window.localStorage.getItem(SERVER_URL_KEY);

    if (raw !== null) {
      const parsed = choiceSchema.safeParse(JSON.parse(raw) as unknown);

      if (parsed.success) {
        return normalizeServerUrl(parsed.data.url);
      }
    }
  } catch {
    // Blocked storage or a mangled value: fall through to the build's choice.
  }

  return defaultServerUrl(env);
}

/** Null means "no server". The value is normalised; an unusable one is refused. */
export function writeServerUrl(url: string | null): boolean {
  const normalized = url === null ? null : normalizeServerUrl(url);

  if (url !== null && !normalized) {
    return false;
  }

  try {
    window.localStorage.setItem(SERVER_URL_KEY, JSON.stringify({ url: normalized }));
    return true;
  } catch {
    return false;
  }
}

/** Forgets the choice, so the build's default applies again. */
export function resetServerUrl(): void {
  try {
    window.localStorage.removeItem(SERVER_URL_KEY);
  } catch {
    // Nothing to forget.
  }
}
