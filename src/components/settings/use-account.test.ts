import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readAccountRecord } from "@/lib/account/account-record";
import { setApiSession } from "@/lib/api/session-store";
import { cipherForRow, getActiveCipher, resetActiveCipher } from "@/lib/cipher";
import { createBranch, listBranches } from "@/lib/entity-storage";
import { createObjectKey, wrapForRecipient } from "@/lib/keys/key-graph";
import { getNotesDb } from "@/lib/notes-db";
import { resetSyncState } from "@/lib/sync/sync-service";
import { server } from "@/test/server";

import { useAccount } from "./use-account";

const BASE = "https://cuervo.example.com";

/** Hoisted, because `vi.mock` runs before the file's own bindings exist. */
const build = vi.hoisted(() => ({ baseUrl: "https://cuervo.example.com" as string | null }));

// Argon2id at its real cost is a second a call, and signing in derives twice.
vi.mock("@/lib/kdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kdf")>()),
  createKdfParams: () => ({
    name: "Argon2id" as const,
    memorySize: 1024,
    iterations: 1,
    parallelism: 1,
    salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
  }),
}));

vi.mock("@/lib/api/account-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/account-api")>()),
  // `import.meta.env` is fixed at build time, so the one value that says whether this build
  // has a server is the one thing the suite has to stand in for.
  apiBaseUrl: () => build.baseUrl,
}));

const TOKEN = "a-session-token";
const USER_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

/** A server that takes the enrolment, opens a session, and holds the keys it is given. */
function acceptingServer(overrides: { register?: number; keys?: number } = {}) {
  const graph = { keys: [], wraps: [], grants: [] };

  server.use(
    http.post(`${BASE}/v1/auth/register`, () =>
      overrides.register
        ? HttpResponse.json(
            { error: "email_taken", message: "taken" },
            { status: overrides.register },
          )
        : HttpResponse.json({ userId: USER_ID }, { status: 201 }),
    ),
    http.post(`${BASE}/v1/auth/session`, () =>
      HttpResponse.json({
        userId: USER_ID,
        email: "owner@example.com",
        token: TOKEN,
        expiresAt: Date.now() + 86_400_000,
        keyMaterial: {
          kdf: {
            name: "Argon2id",
            memorySize: 1024,
            iterations: 1,
            parallelism: 1,
            salt: "c2FsdHktc2FsdC1oZXJl",
          },
          sealedAccountKey: "c2VhbGVkLWFjY291bnQta2V5LWJ5dGVz",
          publicKey: "cHVibGljLWtleS1ieXRlcw",
          sealedPrivateKey: "c2VhbGVkLXByaXZhdGUta2V5LWJ5dGVz",
        },
      }),
    ),
    http.post(`${BASE}/v1/keys`, () =>
      overrides.keys
        ? HttpResponse.json({ error: "invalid_request", message: "no" }, { status: overrides.keys })
        : new HttpResponse(null, { status: 204 }),
    ),
    http.get(`${BASE}/v1/keys/graph`, () => HttpResponse.json(graph)),
    http.delete(`${BASE}/v1/auth/session`, () => new HttpResponse(null, { status: 204 })),
  );
}

async function clearDatabase() {
  const database = await getNotesDb();

  for (const store of ["branches", "notes-documents", "notes-media", "account"] as const) {
    await database.clear(store);
  }
}

beforeEach(async () => {
  build.baseUrl = BASE;
  resetActiveCipher();
  // The session and the cursor are module-level on purpose, so a suite has to put them
  // back: a token left over from the test before would make the next one pass by accident.
  setApiSession(null);
  resetSyncState();
  await clearDatabase();
});

afterEach(async () => {
  resetActiveCipher();
  await clearDatabase();
});

describe("useAccount", () => {
  it("starts with no account on a device that has never signed in", async () => {
    const { result } = renderHook(() => useAccount());

    await waitFor(() => {
      expect(result.current.status).toBe("none");
    });
    expect(result.current.hasServer).toBe(true);
  });

  it("adopts the workspace and leaves it readable", async () => {
    acceptingServer();
    await createBranch({ flightId: "flight-1", name: "Thermodynamics" });

    const { result } = renderHook(() => useAccount());

    await waitFor(() => {
      expect(result.current.status).toBe("none");
    });

    await act(async () => {
      expect(await result.current.createAccount("owner@example.com", "a long passphrase")).toBe(
        true,
      );
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.record?.email).toBe("owner@example.com");
    // Sealed now, and still readable: the key moved, the notes did not.
    expect(getActiveCipher().name).toBe("aes-gcm");
    expect((await listBranches())[0]?.name).toBe("Thermodynamics");
  });

  it("changes nothing when the server refuses the address", async () => {
    acceptingServer({ register: 409 });
    await createBranch({ flightId: "flight-1", name: "Thermodynamics" });

    const { result } = renderHook(() => useAccount());

    await waitFor(() => {
      expect(result.current.status).toBe("none");
    });

    await act(async () => {
      expect(await result.current.createAccount("owner@example.com", "a long passphrase")).toBe(
        false,
      );
    });

    expect(result.current.error).toMatch(/would not take that address/);
    // Still in the clear: nothing was rewritten under a key no server knows about.
    expect(getActiveCipher().name).toBe("none");
  });

  it("changes nothing when the key cannot be recorded", async () => {
    acceptingServer({ keys: 400 });

    const { result } = renderHook(() => useAccount());

    await waitFor(() => {
      expect(result.current.status).toBe("none");
    });

    await act(async () => {
      await result.current.createAccount("owner@example.com", "a long passphrase");
    });

    expect(result.current.status).toBe("none");
    expect(getActiveCipher().name).toBe("none");
  });

  it("opens the workspace again from the passphrase alone", async () => {
    acceptingServer();
    await createBranch({ flightId: "flight-1", name: "Thermodynamics" });

    const first = renderHook(() => useAccount());

    await waitFor(() => {
      expect(first.result.current.status).toBe("none");
    });
    await act(async () => {
      await first.result.current.createAccount("owner@example.com", "a long passphrase");
    });

    // A cold load: the key is only ever in memory.
    resetActiveCipher();

    const second = renderHook(() => useAccount());

    await waitFor(() => {
      expect(second.result.current.status).toBe("locked");
    });

    await act(async () => {
      expect(await second.result.current.signIn("a long passphrase")).toBe(true);
    });

    expect(second.result.current.status).toBe("ready");
    expect((await listBranches())[0]?.name).toBe("Thermodynamics");
  });

  it("refuses the wrong passphrase and stays shut", async () => {
    acceptingServer();
    const first = renderHook(() => useAccount());

    await waitFor(() => {
      expect(first.result.current.status).toBe("none");
    });
    await act(async () => {
      await first.result.current.createAccount("owner@example.com", "a long passphrase");
    });

    resetActiveCipher();
    const second = renderHook(() => useAccount());

    await waitFor(() => {
      expect(second.result.current.status).toBe("locked");
    });
    await act(async () => {
      expect(await second.result.current.signIn("not the passphrase")).toBe(false);
    });

    expect(second.result.current.error).toMatch(/does not open this account/);
    expect(getActiveCipher().name).toBe("none");
  });

  it("says so when there is no account on this device", async () => {
    const { result } = renderHook(() => useAccount());

    await waitFor(() => {
      expect(result.current.status).toBe("none");
    });
    await act(async () => {
      expect(await result.current.signIn("a long passphrase")).toBe(false);
    });

    expect(result.current.error).toMatch(/not signed in/);
  });

  it("will not sync without a session", async () => {
    const { result } = renderHook(() => useAccount());

    await waitFor(() => {
      expect(result.current.status).toBe("none");
    });
    await act(async () => {
      expect(await result.current.sync()).toBe(false);
    });

    expect(result.current.error).toMatch(/Not connected/);
  });

  it("reports what a sync moved", async () => {
    acceptingServer();
    server.use(
      http.post(`${BASE}/v1/sync`, () => HttpResponse.json({ seq: 4, rows: [], hasMore: false })),
      http.get(`${BASE}/v1/media`, () => HttpResponse.json({ media: [] })),
    );

    const { result } = renderHook(() => useAccount());

    await waitFor(() => {
      expect(result.current.status).toBe("none");
    });
    await act(async () => {
      await result.current.createAccount("owner@example.com", "a long passphrase");
    });
    await act(async () => {
      await result.current.sync();
    });

    expect(result.current.lastSync).toMatchObject({ pushed: 0, applied: 0, media: 0 });
  });

  it("reports a server it cannot reach without losing anything local", async () => {
    acceptingServer();
    server.use(http.post(`${BASE}/v1/sync`, () => HttpResponse.error()));

    const { result } = renderHook(() => useAccount());

    await waitFor(() => {
      expect(result.current.status).toBe("none");
    });
    await act(async () => {
      await result.current.createAccount("owner@example.com", "a long passphrase");
    });
    await act(async () => {
      expect(await result.current.sync()).toBe(false);
    });

    expect(result.current.error).toMatch(/Could not reach the server/);
  });

  it("signs in locally even when the server will not answer", async () => {
    acceptingServer();
    await createBranch({ flightId: "flight-1", name: "Thermodynamics" });

    const first = renderHook(() => useAccount());

    await waitFor(() => {
      expect(first.result.current.status).toBe("none");
    });
    await act(async () => {
      await first.result.current.createAccount("owner@example.com", "a long passphrase");
    });

    resetActiveCipher();
    // The device is on a plane: the account is on disk, the server is not reachable.
    server.use(
      http.post(`${BASE}/v1/auth/session`, () => HttpResponse.error()),
      http.get(`${BASE}/v1/keys/graph`, () => HttpResponse.error()),
    );

    const second = renderHook(() => useAccount());

    await waitFor(() => {
      expect(second.result.current.status).toBe("locked");
    });
    await act(async () => {
      expect(await second.result.current.signIn("a long passphrase")).toBe(true);
    });

    // A failed session is not a failed sign-in. The notes are open; only travel is missing.
    expect(second.result.current.status).toBe("ready");
    expect((await listBranches())[0]?.name).toBe("Thermodynamics");
  });

  it("carries on when the key graph will not load", async () => {
    acceptingServer();
    const first = renderHook(() => useAccount());

    await waitFor(() => {
      expect(first.result.current.status).toBe("none");
    });
    await act(async () => {
      await first.result.current.createAccount("owner@example.com", "a long passphrase");
    });

    resetActiveCipher();
    server.use(
      http.get(`${BASE}/v1/keys/graph`, () =>
        HttpResponse.json({ error: "unauthorized", message: "no" }, { status: 401 }),
      ),
    );

    const second = renderHook(() => useAccount());

    await waitFor(() => {
      expect(second.result.current.status).toBe("locked");
    });
    await act(async () => {
      expect(await second.result.current.signIn("a long passphrase")).toBe(true);
    });

    // Shared courses stay shut; this workspace's own key was never in that graph.
    expect(second.result.current.status).toBe("ready");
  });

  it("offers nothing to sign up to when the build has no server", async () => {
    build.baseUrl = null;

    const { result } = renderHook(() => useAccount());

    await waitFor(() => {
      expect(result.current.status).toBe("none");
    });
    expect(result.current.hasServer).toBe(false);

    await act(async () => {
      expect(await result.current.createAccount("owner@example.com", "a long passphrase")).toBe(
        false,
      );
    });

    expect(result.current.error).toMatch(/no server configured/i);
  });

  it("registers a key somebody shared, so their course opens beside your own", async () => {
    acceptingServer();
    const first = renderHook(() => useAccount());

    await waitFor(() => {
      expect(first.result.current.status).toBe("none");
    });
    await act(async () => {
      await first.result.current.createAccount("owner@example.com", "a long passphrase");
    });

    // A course shared with this account: a key wrapped against the public key it published.
    const record = await readAccountRecord();
    const shared = await createObjectKey("branch");

    server.use(
      http.get(`${BASE}/v1/keys/graph`, async () =>
        HttpResponse.json({
          keys: [{ id: shared.keyId, kind: "branch", rotatedFrom: null }],
          wraps: [],
          grants: [
            {
              keyId: shared.keyId,
              role: "reader",
              wrapped: await wrapForRecipient(shared.key, record!.material.publicKey),
            },
          ],
        }),
      ),
    );

    resetActiveCipher();
    const second = renderHook(() => useAccount());

    await waitFor(() => {
      expect(second.result.current.status).toBe("locked");
    });
    await act(async () => {
      await second.result.current.signIn("a long passphrase");
    });

    // A row sealed under their key now has a key on this device to open it with.
    expect(cipherForRow({ encryption: "aes-gcm", keyId: shared.keyId })).not.toBeNull();
  });

  it("changes nothing when the session cannot be opened", async () => {
    acceptingServer();
    server.use(
      http.post(`${BASE}/v1/auth/session`, () =>
        HttpResponse.json({ error: "invalid_credentials", message: "no" }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useAccount());

    await waitFor(() => {
      expect(result.current.status).toBe("none");
    });
    await act(async () => {
      expect(await result.current.createAccount("owner@example.com", "a long passphrase")).toBe(
        false,
      );
    });

    expect(getActiveCipher().name).toBe("none");
  });

  it("forgets the account on sign-out and leaves the notes sealed", async () => {
    acceptingServer();
    await createBranch({ flightId: "flight-1", name: "Thermodynamics" });

    const { result } = renderHook(() => useAccount());

    await waitFor(() => {
      expect(result.current.status).toBe("none");
    });
    await act(async () => {
      await result.current.createAccount("owner@example.com", "a long passphrase");
    });
    await act(async () => {
      await result.current.signOut();
    });

    const database = await getNotesDb();

    expect(result.current.status).toBe("none");
    expect(result.current.record).toBeNull();
    // A door locked, not a note destroyed.
    expect((await database.getAll("branches"))[0]?.encryption).toBe("aes-gcm");
  });
});
