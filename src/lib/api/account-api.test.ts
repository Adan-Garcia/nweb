import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/server";

import { apiBaseUrl, endSession, prelogin } from "./account-api";

const BASE = "https://cuervo.example.com";

describe("apiBaseUrl", () => {
  it("is nothing when this build was given no server", () => {
    expect(apiBaseUrl({})).toBeNull();
    expect(apiBaseUrl({ VITE_API_URL: "   " })).toBeNull();
  });

  it("drops a trailing slash, so a path is not joined onto a double one", () => {
    expect(apiBaseUrl({ VITE_API_URL: "https://cuervo.example.com/" })).toBe(BASE);
    expect(apiBaseUrl({ VITE_API_URL: " https://cuervo.example.com " })).toBe(BASE);
  });
});

describe("prelogin", () => {
  it("asks what to derive with, for an address this device has never seen", async () => {
    server.use(
      http.post(`${BASE}/v1/auth/prelogin`, () =>
        HttpResponse.json({
          kdf: {
            name: "Argon2id",
            memorySize: 65_536,
            iterations: 3,
            parallelism: 1,
            salt: "c2FsdHktc2FsdC1oZXJlIQ==",
          },
        }),
      ),
    );

    const result = await prelogin({ baseUrl: BASE }, "someone@example.com");

    // The server answers for every address, real or not, so this says nothing about who
    // has an account — which is exactly why it is safe to ask.
    expect(result.ok && result.value.kdf.name).toBe("Argon2id");
  });

  it("reports a refusal rather than throwing", async () => {
    server.use(
      http.post(`${BASE}/v1/auth/prelogin`, () =>
        HttpResponse.json({ error: "rate_limited", message: "slow down" }, { status: 429 }),
      ),
    );

    expect(await prelogin({ baseUrl: BASE }, "someone@example.com")).toEqual({
      ok: false,
      error: "rate_limited",
    });
  });
});

describe("endSession", () => {
  it("takes the empty body a 204 has", async () => {
    server.use(
      http.delete(`${BASE}/v1/auth/session`, () => new HttpResponse(null, { status: 204 })),
    );

    expect(await endSession({ baseUrl: BASE, token: "a-token" })).toEqual({
      ok: true,
      value: null,
    });
  });
});
