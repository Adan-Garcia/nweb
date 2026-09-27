// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { clientIpFor } from "./client-ip";

/** What `clientIpFor` answers for a request with these headers. */
async function addressOf(header: string | null, headers: Record<string, string> = {}) {
  const app = new Hono();
  app.get("/", (context) => Response.json({ address: clientIpFor(context, header) }));

  return ((await (await app.request("/", { headers })).json()) as { address: string | null })
    .address;
}

describe("clientIpFor", () => {
  it("reads the caller from the header the proxy sets", async () => {
    expect(await addressOf("cf-connecting-ip", { "cf-connecting-ip": "203.0.113.7" })).toBe(
      "203.0.113.7",
    );
  });

  it("takes the entry the nearest proxy appended, not one the caller wrote first", async () => {
    expect(
      await addressOf("x-forwarded-for", { "x-forwarded-for": "10.9.9.9, 198.51.100.4" }),
    ).toBe("198.51.100.4");
  });

  it("has no answer without the header, or for loopback, rather than a shared one", async () => {
    expect(await addressOf("cf-connecting-ip")).toBeNull();
    expect(await addressOf("x-forwarded-for", { "x-forwarded-for": "127.0.0.1" })).toBeNull();
    expect(await addressOf("x-forwarded-for", { "x-forwarded-for": "::1" })).toBeNull();
    // Driven through `app.request` there is no socket either.
    expect(await addressOf(null)).toBeNull();
  });
});
