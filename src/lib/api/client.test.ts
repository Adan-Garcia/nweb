import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { server } from "@/test/server";

import { apiFetchBytes, apiRequest, apiSendBytes } from "./client";

const SESSION = { baseUrl: "https://api.example", token: "a-token" };
const ANONYMOUS = { baseUrl: "https://api.example" };

const schema = z.object({ value: z.string() });

describe("apiRequest", () => {
  it("returns a body that matches the contract", async () => {
    server.use(http.post("https://api.example/thing", () => HttpResponse.json({ value: "ok" })));

    expect(await apiRequest(SESSION, "/thing", { schema })).toEqual({
      ok: true,
      value: { value: "ok" },
    });
  });

  it("sends the session token, and nothing when there is none", async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.post("https://api.example/thing", ({ request }) => {
        seen.push(request.headers.get("authorization"));

        return HttpResponse.json({ value: "ok" });
      }),
    );

    await apiRequest(SESSION, "/thing", { schema });
    await apiRequest(ANONYMOUS, "/thing", { schema });

    expect(seen).toEqual(["Bearer a-token", null]);
  });

  it("refuses a body that does not match the contract, rather than passing it inward", async () => {
    server.use(http.post("https://api.example/thing", () => HttpResponse.json({ value: 7 })));

    expect(await apiRequest(SESSION, "/thing", { schema })).toEqual({
      ok: false,
      error: "invalid_request",
    });
  });

  it("reads the error the server named", async () => {
    server.use(
      http.post("https://api.example/thing", () =>
        HttpResponse.json({ error: "email_taken", message: "no" }, { status: 409 }),
      ),
    );

    expect(await apiRequest(SESSION, "/thing", { schema })).toEqual({
      ok: false,
      error: "email_taken",
    });
  });

  it("falls back to the status for a failure with no body it understands", async () => {
    server.use(
      http.post("https://api.example/unauthorized", () => new HttpResponse(null, { status: 401 })),
      http.post("https://api.example/teapot", () => new HttpResponse(null, { status: 418 })),
    );

    expect(await apiRequest(SESSION, "/unauthorized", { schema })).toMatchObject({
      error: "unauthorized",
    });
    expect(await apiRequest(SESSION, "/teapot", { schema })).toMatchObject({
      error: "invalid_request",
    });
  });

  it("treats no network as a failure and not as a crash", async () => {
    server.use(http.post("https://api.example/thing", () => HttpResponse.error()));

    expect(await apiRequest(SESSION, "/thing", { schema })).toEqual({
      ok: false,
      error: "invalid_request",
    });
  });

  it("takes a method and a body when it is given them", async () => {
    let received: unknown;
    server.use(
      http.put("https://api.example/thing", async ({ request }) => {
        received = await request.json();

        return HttpResponse.json({ value: "ok" });
      }),
    );

    await apiRequest(SESSION, "/thing", { method: "PUT", body: { a: 1 }, schema });

    expect(received).toEqual({ a: 1 });
  });
});

describe("apiSendBytes", () => {
  it("puts the bytes with the headers it was given", async () => {
    let seen: { type: string | null; bytes: number } | null = null;
    server.use(
      http.put("https://api.example/media/1", async ({ request }) => {
        seen = {
          type: request.headers.get("x-media-type"),
          bytes: (await request.arrayBuffer()).byteLength,
        };

        return new HttpResponse(null, { status: 204 });
      }),
    );

    const result = await apiSendBytes(SESSION, "/media/1", new Uint8Array([1, 2, 3]), {
      "x-media-type": "image/webp",
    });

    expect(result.ok).toBe(true);
    expect(seen).toEqual({ type: "image/webp", bytes: 3 });
  });

  it("sends without a token when there is no session", async () => {
    let seen: string | null = "unset";
    server.use(
      http.put("https://api.example/media/1", ({ request }) => {
        seen = request.headers.get("authorization");

        return new HttpResponse(null, { status: 204 });
      }),
    );

    await apiSendBytes(ANONYMOUS, "/media/1", new Uint8Array([1]), {});

    expect(seen).toBeNull();
  });

  it("reports a refusal and a dead network apart from a success", async () => {
    server.use(
      http.put("https://api.example/refused", () =>
        HttpResponse.json({ error: "too_large", message: "no" }, { status: 413 }),
      ),
      http.put("https://api.example/offline", () => HttpResponse.error()),
    );

    expect(await apiSendBytes(SESSION, "/refused", new Uint8Array(), {})).toEqual({
      ok: false,
      error: "too_large",
    });
    expect(await apiSendBytes(SESSION, "/offline", new Uint8Array(), {})).toEqual({
      ok: false,
      error: "invalid_request",
    });
  });
});

describe("apiFetchBytes", () => {
  it("returns the bytes and the headers that came with them", async () => {
    server.use(
      http.get(
        "https://api.example/media/1",
        () =>
          new HttpResponse(new Uint8Array([7, 8]), { headers: { "x-media-type": "image/webp" } }),
      ),
    );

    const result = await apiFetchBytes(SESSION, "/media/1");

    expect(result.ok).toBe(true);
    expect(result.ok && Array.from(result.value.bytes)).toEqual([7, 8]);
    expect(result.ok && result.value.headers.get("x-media-type")).toBe("image/webp");
  });

  it("fetches without a token when there is no session", async () => {
    let seen: string | null = "unset";
    server.use(
      http.get("https://api.example/media/1", ({ request }) => {
        seen = request.headers.get("authorization");

        return new HttpResponse(new Uint8Array([1]));
      }),
    );

    await apiFetchBytes(ANONYMOUS, "/media/1");

    expect(seen).toBeNull();
  });

  it("reports a missing file and a dead network", async () => {
    server.use(
      http.get("https://api.example/missing", () => new HttpResponse(null, { status: 404 })),
      http.get("https://api.example/offline", () => HttpResponse.error()),
    );

    expect((await apiFetchBytes(SESSION, "/missing")).ok).toBe(false);
    expect((await apiFetchBytes(SESSION, "/offline")).ok).toBe(false);
  });
});
