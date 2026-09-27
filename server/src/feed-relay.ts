import { FEED_MAX_BYTES, looksLikeIcs } from "@shared/feed-contract";
import { isPublicHttpsUrl } from "@shared/sync-contract";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { get as httpsGet } from "node:https";

import { publicOnlyAgent } from "./public-address";

/**
 * Fetching a calendar feed on a signed-in device's behalf (`shared/feed-contract.ts`).
 *
 * The address is somebody else's, so every hop is held to what a push endpoint is: public
 * https by name (`isPublicHttpsUrl`), and a public address by the connection's own lookup
 * (`publicOnlyAgent`), which a name that resolves inward cannot get past. A redirect is a
 * new address and is checked again. The body is capped while it streams, and anything that
 * does not read as a calendar is refused, so the relay cannot be used to read arbitrary
 * pages — not even public ones.
 *
 * Nothing is logged or kept: the address is usually a private link.
 */
export type FeedFetchOutcome =
  { ok: true; text: string } | { ok: false; reason: "unavailable" | "too_large" };

export type FeedFetcher = (url: string) => Promise<FeedFetchOutcome>;

type Get = (
  url: URL,
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => ClientRequest;

const publicGet: Get = (url, options, callback) =>
  httpsGet(url, { ...options, agent: publicOnlyAgent }, callback);

export type FeedFetcherOptions = {
  /** How to make one request. Tests pass `http.get` against a local server. */
  get?: Get;
  /** Which addresses a redirect may lead to. */
  isAllowed?: (url: string) => boolean;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
};

const UNAVAILABLE: FeedFetchOutcome = { ok: false, reason: "unavailable" };

export function createFeedFetcher({
  get = publicGet,
  isAllowed = isPublicHttpsUrl,
  maxBytes = FEED_MAX_BYTES,
  timeoutMs = 15_000,
  maxRedirects = 3,
}: FeedFetcherOptions = {}): FeedFetcher {
  const fetchOnce = (url: URL, redirectsLeft: number): Promise<FeedFetchOutcome> =>
    new Promise((resolve) => {
      const request = get(
        url,
        { headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" }, timeout: timeoutMs },
        (response) => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location;

          if (status >= 300 && status < 400 && location) {
            response.resume();
            // Parsed without throwing: this runs in a socket callback, where an exception
            // is uncaught and takes the whole server down with it.
            const next = URL.parse(location, url.href);

            resolve(
              next && redirectsLeft > 0 && isAllowed(next.href)
                ? fetchOnce(next, redirectsLeft - 1)
                : UNAVAILABLE,
            );
            return;
          }

          if (status < 200 || status >= 300) {
            response.resume();
            resolve(UNAVAILABLE);
            return;
          }

          const chunks: Buffer[] = [];
          let size = 0;

          response.on("data", (chunk: Buffer) => {
            size += chunk.length;

            if (size > maxBytes) {
              request.destroy();
              resolve({ ok: false, reason: "too_large" });
              return;
            }

            chunks.push(chunk);
          });

          response.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");

            resolve(looksLikeIcs(text) ? { ok: true, text } : UNAVAILABLE);
          });

          response.on("error", () => resolve(UNAVAILABLE));
        },
      );

      request.on("timeout", () => request.destroy());
      // Also where a refused address (`ENOTPUBLIC`) lands: to the caller it is a feed
      // that could not be fetched, and saying more would describe this server's network.
      request.on("error", () => resolve(UNAVAILABLE));
    });

  return (url) => fetchOnce(new URL(url), maxRedirects);
}
