// @vitest-environment node
import { get as httpGet, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createFeedFetcher } from "./feed-relay";

const ICS = "BEGIN:VCALENDAR\r\nEND:VCALENDAR";

let server: Server | null = null;

/** A local server answering each path with the handler for it. */
async function serve(
  routes: Record<string, (request: IncomingMessage, response: ServerResponse) => void>,
): Promise<string> {
  server = createServer((request, response) => {
    const handler = routes[request.url ?? ""];

    if (handler) {
      handler(request, response);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));

  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  const running = server;

  server = null;

  if (running) {
    running.closeAllConnections();
    await new Promise((resolve) => running.close(resolve));
  }
});

/** Over plain http to a local server, which is what the tests can reach. */
const local = (options: Parameters<typeof createFeedFetcher>[0] = {}) =>
  createFeedFetcher({ get: httpGet, isAllowed: () => true, ...options });

describe("createFeedFetcher", () => {
  it("fetches a calendar, asking for one", async () => {
    let accept: string | undefined;
    const base = await serve({
      "/feed.ics": (request, response) => {
        accept = request.headers.accept;
        response.end(ICS);
      },
    });

    expect(await local()(`${base}/feed.ics`)).toEqual({ ok: true, text: ICS });
    expect(accept).toContain("text/calendar");
  });

  it("refuses what is not a calendar, and a failing status", async () => {
    const base = await serve({
      "/page": (_request, response) => response.end("<html>Sign in</html>"),
      "/error": (_request, response) => response.writeHead(500).end(),
    });

    expect(await local()(`${base}/page`)).toEqual({ ok: false, reason: "unavailable" });
    expect(await local()(`${base}/error`)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("follows a redirect it is allowed to, and no further than its limit", async () => {
    const base = await serve({
      "/old": (_request, response) => response.writeHead(301, { location: "/feed.ics" }).end(),
      "/loop": (_request, response) => response.writeHead(302, { location: "/loop" }).end(),
      "/feed.ics": (_request, response) => response.end(ICS),
    });

    expect(await local()(`${base}/old`)).toEqual({ ok: true, text: ICS });
    expect(await local()(`${base}/loop`)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("treats a redirect to an address that is not one as unavailable, not a crash", async () => {
    const base = await serve({
      "/bad": (_request, response) => response.writeHead(302, { location: "http://[x" }).end(),
    });

    expect(await local()(`${base}/bad`)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("checks every redirect against what it may reach", async () => {
    const base = await serve({
      "/old": (_request, response) =>
        response.writeHead(302, { location: "http://169.254.169.254/latest" }).end(),
    });
    const seen: string[] = [];
    const fetcher = local({
      isAllowed: (url) => {
        seen.push(url);
        return false;
      },
    });

    expect(await fetcher(`${base}/old`)).toEqual({ ok: false, reason: "unavailable" });
    expect(seen).toEqual(["http://169.254.169.254/latest"]);
  });

  it("stops reading a body larger than its cap", async () => {
    const base = await serve({
      "/big": (_request, response) => {
        response.write(ICS);
        response.end("x".repeat(2048));
      },
    });

    expect(await local({ maxBytes: 1024 })(`${base}/big`)).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("gives up on a host that does not answer", async () => {
    const base = await serve({ "/slow": () => undefined });

    expect(await local({ timeoutMs: 20 })(`${base}/slow`)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("treats a body that breaks off as unavailable", async () => {
    const base = await serve({
      "/cut": (_request, response) => {
        response.writeHead(200, { "content-length": "1000" });
        response.write("BEGIN:VCALENDAR");
        response.destroy();
      },
    });

    expect(await local()(`${base}/cut`)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("treats an error on the response itself as unavailable, rather than crashing", async () => {
    const base = await serve({ "/feed.ics": (_request, response) => response.end(ICS) });
    const fetcher = local({
      get: (url, options, callback) =>
        httpGet(url, options, (response) => {
          callback(response);
          response.emit("error", new Error("reset"));
        }),
    });

    expect(await fetcher(`${base}/feed.ics`)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("by default refuses a name that resolves inside this network", async () => {
    // `localhost` resolves to a loopback address, which the connection's own lookup refuses
    // before a byte is sent — no server needs to be listening for that.
    expect(await createFeedFetcher()("https://localhost:9/feed.ics")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});
