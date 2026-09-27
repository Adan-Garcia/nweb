import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/server";

import { fetchExternalText } from "./client";
import { relayFeed } from "./feed-api";

const FEED = "https://calendar.example.edu/feed.ics";

describe("fetchExternalText", () => {
  it("reads a text file with no credentials", async () => {
    let credentials: RequestCredentials | null = null;
    server.use(
      http.get(FEED, ({ request }) => {
        credentials = request.credentials;

        return HttpResponse.text("BEGIN:VCALENDAR");
      }),
    );

    expect(await fetchExternalText(FEED, 100)).toEqual({ ok: true, text: "BEGIN:VCALENDAR" });
    expect(credentials).toBe("omit");
  });

  it("tells a dead network, a refusal and a file too large apart", async () => {
    server.use(http.get(FEED, () => HttpResponse.error()));
    expect(await fetchExternalText(FEED, 100)).toEqual({ ok: false, reason: "network" });

    server.use(http.get(FEED, () => new HttpResponse("no", { status: 404 })));
    expect(await fetchExternalText(FEED, 100)).toEqual({ ok: false, reason: "status" });

    server.use(
      http.get(FEED, () => new HttpResponse("x", { headers: { "content-length": "500" } })),
    );
    expect(await fetchExternalText(FEED, 100)).toEqual({ ok: false, reason: "too-large" });

    server.use(http.get(FEED, () => HttpResponse.text("x".repeat(101))));
    expect(await fetchExternalText(FEED, 100)).toEqual({ ok: false, reason: "too-large" });
  });

  it("treats a body that breaks off as a network failure", async () => {
    server.use(
      http.get(
        FEED,
        () =>
          new HttpResponse(
            new ReadableStream({
              start(controller) {
                controller.error(new Error("reset"));
              },
            }),
          ),
      ),
    );

    expect(await fetchExternalText(FEED, 100)).toEqual({ ok: false, reason: "network" });
  });
});

describe("relayFeed", () => {
  it("asks the server to fetch the address, with the session", async () => {
    let body: unknown = null;
    server.use(
      http.post("https://api.example/v1/feeds/relay", async ({ request }) => {
        body = await request.json();

        return HttpResponse.json({ text: "BEGIN:VCALENDAR" });
      }),
    );

    expect(await relayFeed({ baseUrl: "https://api.example", token: "t" }, FEED)).toEqual({
      ok: true,
      value: { text: "BEGIN:VCALENDAR" },
    });
    expect(body).toEqual({ url: FEED });
  });
});
