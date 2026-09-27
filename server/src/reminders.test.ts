// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import type { Sql } from "./db";
import { createRateLimiter } from "./rate-limit";
import { findDueReminders, type StoredSubscription, sweepReminders } from "./reminders";
import { createTestDb } from "./test-db";

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

/** Nine in the morning, New York, on a day with nothing unusual about it. */
const DUE_AT = Date.UTC(2026, 9, 1, 13, 0);

let database: Sql & { close: () => Promise<void> };
let app: ReturnType<typeof createApp>;
let userId: string;
let token: string;

async function seedTask(
  id: string,
  overrides: { dueDate?: string | null; dueMinutes?: number | null; status?: string } = {},
) {
  await database.query(
    `insert into rows (user_id, store, id, updated_at, payload, due_date, due_minutes, time_zone, status)
     values ($1, 'twigs', $2, 1, 'sealed', $3, $4, 'America/New_York', $5)`,
    [
      userId,
      id,
      overrides.dueDate === undefined ? "2026-10-01" : overrides.dueDate,
      overrides.dueMinutes === undefined ? 9 * 60 : overrides.dueMinutes,
      overrides.status ?? "incomplete",
    ],
  );
}

async function subscribe(endpoint = "https://push.example/abc") {
  await app.request("/v1/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint, keys: { p256dh: "a-key", auth: "an-auth" } }),
  });
}

beforeEach(async () => {
  database = await createTestDb();
  app = createApp({
    sql: database,
    serverSecret: "a secret",
    allowedOrigins: [],
    limiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
  });

  await app.request("/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ENROLMENT),
  });
  const session = (await (
    await app.request("/v1/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ENROLMENT.email, authKey: ENROLMENT.authKey }),
    })
  ).json()) as { token: string; userId: string };

  token = session.token;
  userId = session.userId;
});

afterEach(async () => {
  await database.close();
});

describe("findDueReminders", () => {
  it("finds a task whose moment has come", async () => {
    await seedTask("twig-1");

    const due = await findDueReminders(database, DUE_AT);

    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ id: "twig-1", dueAt: DUE_AT });
  });

  it("finds one that is nearly due, and not one that is hours off", async () => {
    await seedTask("soon");
    await seedTask("later", { dueMinutes: 23 * 60 });

    const due = await findDueReminders(database, DUE_AT - 10 * 60 * 1000);

    expect(due.map((item) => item.id)).toEqual(["soon"]);
  });

  it("ignores what is done, deleted, or has no date", async () => {
    await seedTask("done", { status: "complete" });
    await seedTask("undated", { dueDate: null, dueMinutes: null });
    await seedTask("deleted");
    await database.query("update rows set deleted_at = 1 where id = 'deleted'");

    expect(await findDueReminders(database, DUE_AT)).toEqual([]);
  });

  it("treats a date with no time as the start of its day", async () => {
    await seedTask("all-day", { dueMinutes: null });

    const due = await findDueReminders(database, Date.UTC(2026, 9, 1, 12, 0));

    expect(new Date(due[0].dueAt).toISOString()).toBe("2026-10-01T04:00:00.000Z");
  });

  it("skips a zone this runtime has never heard of rather than guessing", async () => {
    await seedTask("twig-1");
    await database.query("update rows set time_zone = 'Mars/Olympus_Mons'");

    expect(await findDueReminders(database, DUE_AT)).toEqual([]);
  });
});

describe("sweepReminders", () => {
  const collect = () => {
    const sent: { endpoint: string; payload: string }[] = [];

    return {
      sent,
      deliver: (subscription: StoredSubscription, payload: string) => {
        sent.push({ endpoint: subscription.endpoint, payload });

        return Promise.resolve<"sent" | "gone">("sent");
      },
    };
  };

  it("says how many and when, and nothing about what", async () => {
    await subscribe();
    await seedTask("twig-1");
    await seedTask("twig-2");
    const { sent, deliver } = collect();

    const outcome = await sweepReminders(database, deliver, DUE_AT);

    expect(outcome).toEqual({ sent: 1, dropped: 0 });
    // A count and a time. The title is in a payload this server has no key for.
    expect(JSON.parse(sent[0].payload)).toEqual({ count: 2, dueAt: DUE_AT });
  });

  it("tells every device this account has", async () => {
    await subscribe("https://push.example/laptop");
    await subscribe("https://push.example/phone");
    await seedTask("twig-1");
    const { sent, deliver } = collect();

    await sweepReminders(database, deliver, DUE_AT);

    expect(sent.map((item) => item.endpoint).sort()).toEqual([
      "https://push.example/laptop",
      "https://push.example/phone",
    ]);
  });

  it("never delivers to an endpoint stored before endpoints were checked, and drops it", async () => {
    await subscribe("https://push.example/phone");
    await database.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
       select user_id, 'http://169.254.169.254/latest', p256dh, auth from push_subscriptions`,
    );
    await seedTask("twig-1");
    const { sent, deliver } = collect();

    expect(await sweepReminders(database, deliver, DUE_AT)).toEqual({ sent: 1, dropped: 1 });
    expect(sent.map((item) => item.endpoint)).toEqual(["https://push.example/phone"]);
    expect((await database.query("select * from push_subscriptions")).rows).toHaveLength(1);
  });

  it("says nothing twice about the same moment", async () => {
    await subscribe();
    await seedTask("twig-1");
    const { deliver } = collect();

    await sweepReminders(database, deliver, DUE_AT);
    const again = await sweepReminders(database, deliver, DUE_AT + 60_000);

    expect(again).toEqual({ sent: 0, dropped: 0 });
  });

  it("speaks again when the task is moved to a later time", async () => {
    await subscribe();
    await seedTask("twig-1");
    const { deliver } = collect();
    await sweepReminders(database, deliver, DUE_AT);

    await database.query("update rows set due_date = '2026-10-02' where id = 'twig-1'");

    const later = await sweepReminders(database, deliver, DUE_AT + 24 * 60 * 60 * 1000);
    expect(later.sent).toBe(1);
  });

  it("drops a subscription the push service says is gone", async () => {
    await subscribe();
    await seedTask("twig-1");

    const outcome = await sweepReminders(
      database,
      () => Promise.resolve<"sent" | "gone">("gone"),
      DUE_AT,
    );

    expect(outcome).toEqual({ sent: 0, dropped: 1 });
    const { rows } = await database.query("select * from push_subscriptions");
    expect(rows).toEqual([]);
  });

  it("does nothing when nobody is listening", async () => {
    await seedTask("twig-1");
    const { sent, deliver } = collect();

    expect(await sweepReminders(database, deliver, DUE_AT)).toEqual({ sent: 0, dropped: 0 });
    expect(sent).toEqual([]);
  });
});

describe("the subscription routes", () => {
  it("take a subscription and give it back up", async () => {
    await subscribe();

    const { rows } = await database.query<{ endpoint: string }>(
      "select endpoint from push_subscriptions",
    );
    expect(rows[0].endpoint).toBe("https://push.example/abc");

    await app.request("/v1/push/subscribe", {
      method: "DELETE",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: "https://push.example/abc" }),
    });

    expect((await database.query("select * from push_subscriptions")).rows).toEqual([]);
  });

  it("replace a subscription rather than storing it twice", async () => {
    await subscribe();
    await subscribe();

    expect((await database.query("select * from push_subscriptions")).rows).toHaveLength(1);
  });

  it("refuse an endpoint that is not a public push service", async () => {
    // The sweep POSTs to whatever is stored here, from inside the server's network. An
    // address that points back into it would make every reminder a request forged for
    // somebody else.
    for (const endpoint of [
      "http://push.example/abc",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.5/push",
      "https://[::1]/push",
      "https://localhost/push",
      "https://db.internal/push",
      "https://printer.local/push",
      "https://intranet/push",
      "https://user:pass@push.example/abc",
      `https://push.example/${"a".repeat(3000)}`,
    ]) {
      const response = await app.request("/v1/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint, keys: { p256dh: "p", auth: "a" } }),
      });

      expect({ endpoint, status: response.status }).toEqual({ endpoint, status: 400 });
    }

    expect((await database.query("select * from push_subscriptions")).rows).toHaveLength(0);
  });

  it("refuse what is not a subscription, and anyone without a session", async () => {
    const bad = await app.request("/v1/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: "not a url" }),
    });
    expect(bad.status).toBe(400);

    const badJson = await app.request("/v1/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: "{ not json",
    });
    expect(badJson.status).toBe(400);

    expect((await app.request("/v1/push/subscribe", { method: "POST" })).status).toBe(401);
    expect((await app.request("/v1/push/subscribe", { method: "DELETE" })).status).toBe(401);

    const badDelete = await app.request("/v1/push/subscribe", {
      method: "DELETE",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: "{ not json",
    });
    expect(badDelete.status).toBe(400);
  });
});

describe("configurePush", () => {
  it("takes the VAPID details the push services check against", async () => {
    const { configurePush } = await import("./push");

    // Real keys, because web-push validates the curve rather than taking a string.
    const { generateVAPIDKeys } = await import("web-push");
    const keys = generateVAPIDKeys();

    expect(() => {
      configurePush({
        subject: "mailto:nobody@example.com",
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
      });
    }).not.toThrow();
  });
});

describe("deliverPush", () => {
  it("reports a dead subscription apart from a bad minute at the push service", async () => {
    vi.resetModules();
    const { WebPushError } = await import("web-push");

    // The default export, not the named one: `web-push` is CommonJS, and the bundled
    // server can only reach it through its namespace, so that is what `push.ts` calls.
    vi.doMock("web-push", async (importOriginal) => {
      const actual = await importOriginal<typeof import("web-push")>();
      const sendNotification = vi
        .fn()
        .mockRejectedValueOnce(new WebPushError("gone", 410, {}, "", ""))
        .mockRejectedValueOnce(new WebPushError("busy", 503, {}, "", ""))
        .mockRejectedValueOnce(Object.assign(new Error("private"), { code: "ENOTPUBLIC" }))
        .mockResolvedValueOnce({});

      const mocked = { ...actual, sendNotification };

      return { ...mocked, default: mocked };
    });

    const { deliverPush } = await import("./push");
    const subscription = { endpoint: "https://push.example/a", keys: { p256dh: "p", auth: "a" } };

    expect(await deliverPush(subscription, "{}")).toBe("gone");
    expect(await deliverPush(subscription, "{}")).toBe("sent");
    // A name that resolves into this server's own network is dropped, never retried.
    expect(await deliverPush(subscription, "{}")).toBe("gone");
    expect(await deliverPush(subscription, "{}")).toBe("sent");
    // Every delivery goes through the agent that checks the address it connects to.
    const { publicOnlyAgent } = await import("./public-address");
    const { default: mocked } = await import("web-push");
    expect(mocked.sendNotification).toHaveBeenCalledWith(subscription, "{}", {
      agent: publicOnlyAgent,
    });

    vi.doUnmock("web-push");
  });
});
