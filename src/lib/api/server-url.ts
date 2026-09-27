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

/** A usable base URL, or null: http(s) only, no trailing slash, no path beyond the host. */
export function normalizeServerUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** What the build was pointed at, which is also what "reset" goes back to. */
export function defaultServerUrl(env: Env = import.meta.env): string | null {
  return normalizeServerUrl(env.VITE_API_URL);
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
