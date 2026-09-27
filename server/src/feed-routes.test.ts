// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app";
import type { Sql } from "./db";
import type { FeedFetcher } from "./feed-relay";
import { createRateLimiter } from "./rate-limit";
import { createTestDb } from "./test-db";

const FEED = "https://calendar.example.edu/feed.ics";
const ICS = "BEGIN:VCALENDAR\r\nEND:VCALENDAR";

const ENROLMENT = {
  email: "student@example.com",
  authKey: "YXV0aC1rZXktYmFzZTY0LXZhbHVl",
  kdf: {
    name: "Argon2id" as const,
    memorySize: 65_536,
    iterations: 3,
    parallelism: 1,
    salt: "c2FsdHktc2FsdC1oZXJlIQ==",
  },
  sealedAccountKey: "c2VhbGVkLWFjY291bnQta2V5LWJ5dGVz",
  publicKey: "cHVibGljLWtleS1zcGtpLWJ5dGVz",
  sealedPrivateKey: "c2VhbGVkLXByaXZhdGUta2V5LWJ5dGVz",
};

let database: Sql & { close: () => Promise<void> };
let fetched: string[];
let answer: Awaited<ReturnType<FeedFetcher>>;
let app: ReturnType<typeof createApp>;

const post = (path: string, body: unknown, token?: string) =>
  app.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

async function signIn(): Promise<string> {
  await post("/v1/auth/register", ENROLMENT);
  const response = await post("/v1/auth/session", {
    email: ENROLMENT.email,
    authKey: ENROLMENT.authKey,
  });

  return ((await response.json()) as { token: string }).token;
}

beforeEach(async () => {
  database = await createTestDb();
  fetched = [];
  answer = { ok: true, text: ICS };
  app = createApp({
    sql: database,
    serverSecret: "a secret this server keeps",
    allowedOrigins: [],
    limiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    feedLimiter: createRateLimiter({ limit: 2, windowMs: 60_000 }),
    fetchFeed: (url) => {
      fetched.push(url);
      return Promise.resolve(answer);
    },
  });
});

afterEach(async () => {
  await database.close();
});

describe("the feed relay", () => {
  it("fetches a feed for a signed-in caller", async () => {
    const response = await post("/v1/feeds/relay", { url: FEED }, await signIn());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: ICS });
    expect(fetched).toEqual([FEED]);
  });

  it("is not an open proxy: no session, no fetch", async () => {
    const response = await post("/v1/feeds/relay", { url: FEED });

    expect(response.status).toBe(401);
    expect(fetched).toEqual([]);
  });

  it.each([
    "http://calendar.example.edu/feed.ics",
    "https://localhost/feed.ics",
    "https://169.254.169.254/latest",
    "https://user:pass@calendar.example.edu/feed.ics",
    "not a url",
  ])("refuses to fetch %s", async (url) => {
    const response = await post("/v1/feeds/relay", { url }, await signIn());

    expect(response.status).toBe(400);
    expect(fetched).toEqual([]);
  });

  it("refuses a body that is not JSON", async () => {
    const response = await app.request("/v1/feeds/relay", {
      method: "POST",
      headers: { authorization: `Bearer ${await signIn()}` },
      body: "not json",
    });

    expect(response.status).toBe(400);
    expect(fetched).toEqual([]);
  });

  it("says why a fetch failed without describing what it found", async () => {
    const token = await signIn();

    answer = { ok: false, reason: "unavailable" };
    const unavailable = await post("/v1/feeds/relay", { url: FEED }, token);

    expect(unavailable.status).toBe(502);
    expect(await unavailable.json()).toMatchObject({ error: "feed_unavailable" });

    answer = { ok: false, reason: "too_large" };
    expect((await post("/v1/feeds/relay", { url: FEED }, token)).status).toBe(413);
  });

  it("limits how often one account may use it", async () => {
    const token = await signIn();

    await post("/v1/feeds/relay", { url: FEED }, token);
    await post("/v1/feeds/relay", { url: FEED }, token);
    const third = await post("/v1/feeds/relay", { url: FEED }, token);

    expect(third.status).toBe(429);
    expect(fetched).toHaveLength(2);
  });

  it("is mounted with a real fetcher and limiter when none is passed", async () => {
    const plain = createApp({ sql: database, serverSecret: "s", allowedOrigins: [] });
    const response = await plain.request("/v1/feeds/relay", { method: "POST", body: "{}" });

    expect(response.status).toBe(401);
  });
});
