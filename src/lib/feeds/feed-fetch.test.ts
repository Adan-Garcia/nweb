import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { server } from "@/test/server";

import { setApiSession } from "../api/session-store";
import { fetchFeedText } from "./feed-fetch";

const FEED = "https://calendar.example.edu/feed.ics";
const RELAY = "https://api.example/v1/feeds/relay";
const ICS = "BEGIN:VCALENDAR\r\nEND:VCALENDAR";

afterEach(() => {
  setApiSession(null);
});

describe("fetchFeedText", () => {
  it("refuses an address that is not one", async () => {
    expect(await fetchFeedText("mailto:someone")).toEqual({ ok: false, error: "invalid-url" });
  });

  it("reads a feed directly, webcal included, when its host allows it", async () => {
    server.use(http.get(FEED, () => HttpResponse.text(ICS)));

    expect(await fetchFeedText("webcal://calendar.example.edu/feed.ics")).toEqual({
      ok: true,
      text: ICS,
    });
  });

  it("refuses a page served in place of a calendar", async () => {
    server.use(http.get(FEED, () => HttpResponse.text("<html>Sign in</html>")));

    expect(await fetchFeedText(FEED)).toEqual({ ok: false, error: "not-calendar" });
  });

  it("reports a host's refusal, or a feed too large, without trying the relay", async () => {
    setApiSession({ baseUrl: "https://api.example", token: "t" });
    server.use(http.get(FEED, () => new HttpResponse(null, { status: 403 })));
    expect(await fetchFeedText(FEED)).toEqual({ ok: false, error: "unreachable" });

    server.use(
      http.get(
        FEED,
        () => new HttpResponse("x", { headers: { "content-length": String(6 * 1024 * 1024) } }),
      ),
    );
    expect(await fetchFeedText(FEED)).toEqual({ ok: false, error: "too-large" });
  });

  it("says a server is needed when the host blocks browsers and there is none", async () => {
    server.use(http.get(FEED, () => HttpResponse.error()));

    expect(await fetchFeedText(FEED)).toEqual({ ok: false, error: "blocked" });

    setApiSession({ baseUrl: "https://api.example" });
    expect(await fetchFeedText(FEED)).toEqual({ ok: false, error: "blocked" });
  });

  it("goes through the sync server when the host blocks browsers", async () => {
    setApiSession({ baseUrl: "https://api.example", token: "t" });
    server.use(
      http.get(FEED, () => HttpResponse.error()),
      http.post(RELAY, () => HttpResponse.json({ text: ICS })),
    );

    expect(await fetchFeedText(FEED)).toEqual({ ok: true, text: ICS });
  });

  it("maps what the relay says went wrong", async () => {
    setApiSession({ baseUrl: "https://api.example", token: "t" });
    server.use(
      http.get(FEED, () => HttpResponse.error()),
      http.post(RELAY, () =>
        HttpResponse.json({ error: "too_large", message: "" }, { status: 413 }),
      ),
    );
    expect(await fetchFeedText(FEED)).toEqual({ ok: false, error: "too-large" });

    server.use(
      http.post(RELAY, () =>
        HttpResponse.json({ error: "feed_unavailable", message: "" }, { status: 502 }),
      ),
    );
    expect(await fetchFeedText(FEED)).toEqual({ ok: false, error: "unreachable" });

    server.use(http.post(RELAY, () => HttpResponse.json({ text: "<html>" })));
    expect(await fetchFeedText(FEED)).toEqual({ ok: false, error: "not-calendar" });
  });
});
