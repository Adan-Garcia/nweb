// @vitest-environment node
import { serve } from "@hono/node-server";
import { preloginResponseSchema } from "@shared/account-contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "./app";
import type { Sql } from "./db";
import { createTestDb } from "./test-db";

/**
 * The one test that goes over a real socket.
 *
 * Every other suite drives `app.request()`, which is the Hono instance and not a server.
 * That is the right level for route behaviour and it proves nothing about whether this can
 * be deployed: the adapter, the port, and a real HTTP client are exactly what it skips.
 */
let database: Sql & { close: () => Promise<void> };
let server: ReturnType<typeof serve>;
let origin: string;

beforeAll(async () => {
  database = await createTestDb();

  const app = createApp({
    sql: database,
    serverSecret: "a-secret-long-enough",
    allowedOrigins: ["https://app.example.com"],
  });

  // Port 0: the operating system picks a free one, so two runs at once do not collide.
  server = serve({ fetch: app.fetch, port: 0 });

  const address = server.address();

  origin = `http://127.0.0.1:${typeof address === "string" ? address : address?.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await database.close();
});

describe("the server, over a socket", () => {
  it("answers a real request on a real port", async () => {
    const response = await fetch(`${origin}/v1/auth/prelogin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "someone@example.com" }),
    });

    expect(response.status).toBe(200);

    const body = preloginResponseSchema.safeParse(await response.json());

    // An address with no account still gets parameters, over HTTP as in process.
    expect(body.success).toBe(true);
  });

  it("carries a session end to end", async () => {
    const enrolment = {
      email: "owner@example.com",
      authKey: "YXV0aC1rZXktYmFzZTY0LXZhbHVl",
      kdf: {
        name: "Argon2id" as const,
        memorySize: 65_536,
        iterations: 3,
        parallelism: 1,
        salt: "c2FsdHktc2FsdC1oZXJl",
      },
      sealedAccountKey: "c2VhbGVkLWFjY291bnQta2V5",
      sealedPrivateKey: "c2VhbGVkLXByaXZhdGUta2V5",
      publicKey: "cHVibGljLWtleQ",
    };
    const json = (path: string, body: unknown) =>
      fetch(`${origin}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    expect((await json("/v1/auth/register", enrolment)).status).toBe(201);

    const session = await json("/v1/auth/session", {
      email: enrolment.email,
      authKey: enrolment.authKey,
    });
    const { token } = (await session.json()) as { token: string };

    const keys = await fetch(`${origin}/v1/keys`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(await keys.json()).toMatchObject({ sealedAccountKey: enrolment.sealedAccountKey });
  });

  it("refuses a request without a session, over the wire too", async () => {
    const response = await fetch(`${origin}/v1/keys/graph`);

    expect(response.status).toBe(401);
  });

  it("sends CORS headers for an allowed origin and not for another", async () => {
    const allowed = await fetch(`${origin}/v1/keys/graph`, {
      headers: { origin: "https://app.example.com" },
    });
    const other = await fetch(`${origin}/v1/keys/graph`, {
      headers: { origin: "https://elsewhere.example.com" },
    });

    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});
