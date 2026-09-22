import type { SyncRow } from "@shared/sync-contract";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { server } from "@/test/server";

import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "../cipher";
import { createBranch } from "../entity-storage";
import { getNotesDb } from "../notes-db";
import { createTwig, listTwigs } from "../twig-storage";
import { EMPTY_SYNC_STATE, runSync, syncUntilSettled } from "./run-sync";
import { fromSyncRow, toSyncRow } from "./wire";

const SESSION = { baseUrl: "https://api.example", token: "a-token" };

/** A server that keeps what it is given, in order, the way the real one does. */
function fakeServer() {
  const stored: SyncRow[] = [];
  const received: SyncRow[][] = [];

  server.use(
    http.post("https://api.example/v1/sync", async ({ request }) => {
      const body = (await request.json()) as { since: number; rows: SyncRow[] };
      received.push(body.rows);

      for (const row of body.rows) {
        const existing = stored.findIndex(
          (candidate) => candidate.store === row.store && candidate.id === row.id,
        );

        if (existing >= 0) {
          stored.splice(existing, 1);
        }

        stored.push(row);
      }

      const page = stored.slice(body.since);

      return HttpResponse.json({
        seq: body.since + page.length,
        rows: page,
        hasMore: false,
      });
    }),
  );

  return { stored, received };
}

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("twigs"),
    database.clear("branches"),
    database.clear("notes-directory"),
    database.clear("notes-documents"),
  ]);
});

afterEach(() => {
  resetActiveCipher();
});

describe("runSync", () => {
  it("sends what has changed and marks it as sent", async () => {
    const { received } = fakeServer();
    const branch = await createBranch({ flightId: "flight-1", name: "Organic Chemistry" });
    await createTwig({ branchId: branch.id, title: "Problem set", dueDate: "2026-10-01" });

    const first = await runSync(SESSION, EMPTY_SYNC_STATE);

    expect(first?.outcome.pushed).toBe(2);
    expect(received[0].map((row) => row.store).sort()).toEqual(["branches", "twigs"]);

    // Nothing changed since, so the next round has nothing to send.
    const second = await runSync(SESSION, first!.state);
    expect(second?.outcome.pushed).toBe(0);
  });

  it("puts the whole row inside the seal and only the schedule outside it", async () => {
    const { received } = fakeServer();
    const branch = await createBranch({ flightId: "flight-1", name: "Organic Chemistry" });
    await createTwig({
      branchId: branch.id,
      title: "SECRET-TASK",
      dueDate: "2026-10-01",
      dueTime: "9:00 AM",
    });

    setActiveCipher(
      createAesGcmCipher(
        await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
          "encrypt",
          "decrypt",
        ]),
        "key-a",
      ),
    );
    await runSync(SESSION, EMPTY_SYNC_STATE);

    const twig = received[0].find((row) => row.store === "twigs")!;

    // Not the title, not the branch it belongs to, not what kind of task it is.
    expect(JSON.stringify(twig)).not.toContain("SECRET-TASK");
    expect(JSON.stringify(twig)).not.toContain(branch.id);
    // What a reminder needs, and that is all.
    expect(twig.schedule).toEqual({
      dueDate: "2026-10-01",
      dueMinutes: 540,
      timeZone: "America/New_York",
      status: "incomplete",
    });
  });

  it("applies a row from the server that is newer than what is here", async () => {
    fakeServer();
    const branch = await createBranch({ flightId: "flight-1", name: "Organic Chemistry" });
    const twig = await createTwig({ branchId: branch.id, title: "Problem set" });
    const state = (await runSync(SESSION, EMPTY_SYNC_STATE))!.state;

    // Another device renames it. Same id, later timestamp.
    const elsewhere = await toSyncRow("twigs", {
      ...twig,
      title: "Renamed",
      updatedAt: twig.updatedAt + 10_000,
    });
    server.use(
      http.post("https://api.example/v1/sync", () =>
        HttpResponse.json({ seq: 99, rows: [elsewhere], hasMore: false }),
      ),
    );

    const result = await runSync(SESSION, state);

    expect(result?.outcome.applied).toBe(1);
    expect((await listTwigs())[0].title).toBe("Renamed");
  });

  it("leaves a row alone when what is here is newer", async () => {
    fakeServer();
    const branch = await createBranch({ flightId: "flight-1", name: "Organic Chemistry" });
    const twig = await createTwig({ branchId: branch.id, title: "Mine" });

    const older = await toSyncRow("twigs", { ...twig, title: "Theirs", updatedAt: 1 });
    server.use(
      http.post("https://api.example/v1/sync", () =>
        HttpResponse.json({ seq: 5, rows: [older], hasMore: false }),
      ),
    );

    const result = await runSync(SESSION, EMPTY_SYNC_STATE);

    expect(result?.outcome.applied).toBe(0);
    expect((await listTwigs())[0].title).toBe("Mine");
  });

  it("skips a row it cannot make sense of rather than storing half of it", async () => {
    fakeServer();
    const nonsense: SyncRow = {
      store: "twigs",
      id: "bad-row",
      updatedAt: 9_999,
      deletedAt: null,
      keyId: "",
      encryption: "none",
      payload: btoa('{"not":"a twig"}'),
      schedule: null,
    };
    server.use(
      http.post("https://api.example/v1/sync", () =>
        HttpResponse.json({ seq: 5, rows: [nonsense], hasMore: false }),
      ),
    );

    const result = await runSync(SESSION, EMPTY_SYNC_STATE);

    expect(result?.outcome.applied).toBe(0);
    const database = await getNotesDb();
    expect(await database.get("twigs", "bad-row")).toBeUndefined();
  });

  it("gives up quietly when there is no network, so nothing local is lost", async () => {
    server.use(http.post("https://api.example/v1/sync", () => HttpResponse.error()));
    await createBranch({ flightId: "flight-1", name: "Organic Chemistry" });

    expect(await runSync(SESSION, EMPTY_SYNC_STATE)).toBeNull();
    // Still here, and still pending for the next attempt.
    const database = await getNotesDb();
    expect(await database.count("branches")).toBe(1);
  });

  it("reports a wrong session rather than pretending it worked", async () => {
    server.use(
      http.post("https://api.example/v1/sync", () =>
        HttpResponse.json({ error: "unauthorized", message: "no" }, { status: 401 }),
      ),
    );

    expect(await runSync(SESSION, EMPTY_SYNC_STATE)).toBeNull();
  });
});

describe("syncUntilSettled", () => {
  it("keeps going while either side has more", async () => {
    let calls = 0;
    server.use(
      http.post("https://api.example/v1/sync", () => {
        calls += 1;

        return HttpResponse.json({ seq: calls, rows: [], hasMore: calls < 3 });
      }),
    );

    const result = await syncUntilSettled(SESSION, EMPTY_SYNC_STATE);

    expect(calls).toBe(3);
    expect(result?.outcome.hasMore).toBe(false);
  });

  it("stops at the round limit rather than looping forever", async () => {
    let calls = 0;
    server.use(
      http.post("https://api.example/v1/sync", () => {
        calls += 1;

        return HttpResponse.json({ seq: calls, rows: [], hasMore: true });
      }),
    );

    await syncUntilSettled(SESSION, EMPTY_SYNC_STATE, 4);

    expect(calls).toBe(4);
  });

  it("keeps what the last good round achieved when a later one fails", async () => {
    let calls = 0;
    server.use(
      http.post("https://api.example/v1/sync", () => {
        calls += 1;

        return calls === 1
          ? HttpResponse.json({ seq: 7, rows: [], hasMore: true })
          : HttpResponse.error();
      }),
    );

    const result = await syncUntilSettled(SESSION, EMPTY_SYNC_STATE);

    expect(result?.state.cursor).toBe(7);
  });
});

describe("the wire format", () => {
  it("round-trips a row through the seal", async () => {
    const branch = await createBranch({ flightId: "flight-1", name: "Organic Chemistry" });
    const database = await getNotesDb();
    const stored = (await database.get("branches", branch.id))!;

    const opened = await fromSyncRow(await toSyncRow("branches", stored));

    expect(opened).toMatchObject({ id: branch.id, flightId: "flight-1" });
  });

  it("refuses a payload that is not an object at all", async () => {
    const row: SyncRow = {
      store: "twigs",
      id: "bad",
      updatedAt: 1,
      deletedAt: null,
      keyId: "",
      encryption: "none",
      payload: btoa('"just a string"'),
      schedule: null,
    };

    expect(await fromSyncRow(row)).toBeNull();
  });

  it("refuses a payload this build cannot open", async () => {
    const row: SyncRow = {
      store: "twigs",
      id: "bad",
      updatedAt: 1,
      deletedAt: null,
      keyId: "some-other-key",
      encryption: "aes-gcm",
      payload: btoa("not openable"),
      schedule: null,
    };

    expect(await fromSyncRow(row)).toBeNull();
  });

  it("sends no schedule for a task row it cannot read as a task", async () => {
    const wire = await toSyncRow("twigs", { id: "x", updatedAt: 1, notATwig: true });

    expect(wire.schedule).toBeNull();
  });

  it("round-trips a document's compressed bytes, which JSON would mangle", async () => {
    const database = await getNotesDb();
    const document = {
      id: "doc-1",
      linearCompressed: new Uint8Array([1, 2, 3]),
      linearCompressionAlgorithm: "brotli",
      sceneCompressed: null,
      sceneCompressionAlgorithm: null,
      sceneFiles: [],
      updatedAt: 5,
    };
    await database.put("notes-documents", document);

    const opened = await fromSyncRow(await toSyncRow("notes-documents", document));

    expect(Array.from(opened?.linearCompressed as Uint8Array)).toEqual([1, 2, 3]);
    expect(opened?.sceneCompressed).toBeNull();
  });
});
