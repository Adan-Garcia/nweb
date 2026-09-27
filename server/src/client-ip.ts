import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/**
 * Where a request came from, for rate limiting — or null when that cannot be told.
 *
 * Behind a proxy (a Cloudflare Tunnel, a reverse proxy) the socket's address is the proxy's,
 * so the caller's is read from the header the proxy is configured to set. That header is
 * only as trustworthy as the proxy: the server's own port must not be reachable from
 * anywhere else, or a caller could name any address they liked (docs/deploy.md).
 *
 * A loopback address is never an answer. Through a tunnel with no header configured, every
 * request would share it, and a per-address limit would become one limit for everybody.
 */
const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;

export function clientIpFor(context: Context, header: string | null): string | null {
  let address: string | undefined;

  if (header) {
    // A chain of proxies appends; the last entry is the one the nearest proxy wrote.
    address = context.req
      .header(header)
      ?.split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1);
  } else {
    try {
      address = getConnInfo(context).remote.address;
    } catch {
      // Not served by the Node adapter (tests drive `app.request`): no socket to ask.
      address = undefined;
    }
  }

  return address && !LOOPBACK.test(address) ? address : null;
}
