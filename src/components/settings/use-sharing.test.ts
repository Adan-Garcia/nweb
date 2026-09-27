import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bytesToBase64 } from "@/lib/base64";
import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "@/lib/cipher";
import { createBranch, createFlight, createNest, createWing } from "@/lib/entity-storage";
import { createObjectKey, type Keyring, openKeyGraph } from "@/lib/keys/key-graph";
import { currentKeyGraph, forgetKeyring, holdKeyring } from "@/lib/keys/object-keys";
import { getNotesDb } from "@/lib/notes-db";
import { createNotesDirectoryEntry } from "@/lib/notes-directory-storage";
import { server } from "@/test/server";

import { useSharing } from "./use-sharing";

/** Success is reported as a toast; what is said is what is checked. */
const toast = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  notifyInfo: vi.fn(),
}));

vi.mock("@/lib/toast", () => toast);

const BASE = "https://cuervo.example.com";
const session = { baseUrl: BASE, token: "a-token" };
const sessionFor = () => session;

/** The recipient, with a real keypair, so a wrap this device makes really opens for them. */
async function identity() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["wrapKey", "unwrapKey"],
  );

  return {
    privateKey: pair.privateKey,
    publicKey: bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey))),
  };
}

let mine: { publicKey: string; privateKey: CryptoKey };

/** A workspace with an account, one course and one note in it. */
async function seedWorkspace() {
  const wing = await createObjectKey("wing");
  const keyring: Keyring = new Map([[wing.keyId, wing.key]]);

  setActiveCipher(createAesGcmCipher(wing.key, wing.keyId));
  holdKeyring(keyring, {
    keys: [{ id: wing.keyId, kind: "wing", rotatedFrom: null }],
    wraps: [],
    grants: [],
  });

  const wingRow = await createWing("My wing");
  const flight = await createFlight({ wingId: wingRow.id, name: "Fall 2026" });
  const branch = await createBranch({ flightId: flight.id, name: "Thermodynamics" });
  const nest = await createNest({ branchId: branch.id, name: "Unit 1" });

  await createNotesDirectoryEntry({ branchId: branch.id, feather: "Entropy", nestIds: [nest.id] });

  const database = await getNotesDb();

  return {
    keyring,
    branchKeyId: (await database.get("branches", branch.id))?.keyId ?? "",
  };
}

async function clearStores() {
  const database = await getNotesDb();

  for (const store of [
    "wings",
    "flights",
    "branches",
    "nests",
    "notes-directory",
    "notes-documents",
    "share-paths",
  ] as const) {
    await database.clear(store);
  }
}

beforeEach(async () => {
  mine = await identity();
  await clearStores();
});

afterEach(async () => {
  forgetKeyring();
  resetActiveCipher();
  await clearStores();
});

describe("useSharing", () => {
  it("lists what has a key of its own", async () => {
    await seedWorkspace();

    const { result } = renderHook(() => useSharing(sessionFor, mine.publicKey));

    await waitFor(() => {
      expect(result.current.shareable.length).toBeGreaterThan(0);
    });

    // A tag is shareable exactly as a course is, even though one contains the other.
    expect(result.current.shareable.map((thing) => thing.name).sort()).toEqual([
      "Entropy",
      "Thermodynamics",
      "Unit 1",
    ]);
    expect(result.current.shareable.find((thing) => thing.kind === "nest")?.within).toBe(
      "Thermodynamics",
    );
  });

  it("lists who holds the one that was picked", async () => {
    const { branchKeyId } = await seedWorkspace();

    server.use(
      http.get(`${BASE}/v1/keys/${branchKeyId}/shares`, () =>
        HttpResponse.json({ shares: [{ email: "friend@example.com", role: "reader" }] }),
      ),
    );

    const { result } = renderHook(() => useSharing(sessionFor, mine.publicKey));

    act(() => {
      result.current.select(branchKeyId);
    });

    await waitFor(() => {
      expect(result.current.shares).toEqual([{ email: "friend@example.com", role: "reader" }]);
    });

    // Shared before paths existed: looking at it is enough to give it one.
    await waitFor(async () => {
      expect(await (await getNotesDb()).count("share-paths")).toBe(1);
    });
  });

  it("wraps the key against what the recipient published", async () => {
    const { branchKeyId, keyring } = await seedWorkspace();
    const friend = await identity();
    let wrapped = "";

    server.use(
      http.get(`${BASE}/v1/users/public-key`, () =>
        HttpResponse.json({ email: "friend@example.com", publicKey: friend.publicKey }),
      ),
      http.post(`${BASE}/v1/keys/share`, async ({ request }) => {
        const body = (await request.json()) as { wrapped: string };

        wrapped = body.wrapped;

        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${BASE}/v1/keys/${branchKeyId}/shares`, () => HttpResponse.json({ shares: [] })),
    );

    const { result } = renderHook(() => useSharing(sessionFor, mine.publicKey));

    await act(async () => {
      expect(await result.current.share(branchKeyId, "friend@example.com", "reader")).toBe(true);
    });
    expect(toast.notifySuccess).toHaveBeenCalledWith("Shared with friend@example.com");

    // The wrap really opens for them: what the server stored is bytes it cannot read, and
    // the key inside is the course's.
    const theirs = await openKeyGraph(
      {
        keys: currentKeyGraph()!.keys,
        wraps: currentKeyGraph()!.wraps,
        grants: [{ keyId: branchKeyId, role: "reader", wrapped }],
      },
      friend.privateKey,
    );

    expect(theirs.has(branchKeyId)).toBe(true);

    // The names above the course go with it, sealed under the course's own key.
    const [path] = await (await getNotesDb()).getAll("share-paths");

    expect(path).toMatchObject({ kind: "branch", keyId: branchKeyId });
    expect(await crypto.subtle.exportKey("raw", theirs.get(branchKeyId)!)).toEqual(
      await crypto.subtle.exportKey("raw", keyring.get(branchKeyId)!),
    );
  });

  it("refuses an address nobody has, without saying more than that", async () => {
    const { branchKeyId } = await seedWorkspace();

    server.use(
      http.get(`${BASE}/v1/users/public-key`, () =>
        HttpResponse.json({ error: "invalid_request", message: "no" }, { status: 400 }),
      ),
    );

    const { result } = renderHook(() => useSharing(sessionFor, mine.publicKey));

    await act(async () => {
      expect(await result.current.share(branchKeyId, "nobody@example.com", "reader")).toBe(false);
    });

    expect(result.current.error).toMatch(/Nobody with that address/);
  });

  it("reports a server that would not record the share", async () => {
    const { branchKeyId } = await seedWorkspace();
    const friend = await identity();

    server.use(
      http.get(`${BASE}/v1/users/public-key`, () =>
        HttpResponse.json({ email: "friend@example.com", publicKey: friend.publicKey }),
      ),
      http.post(`${BASE}/v1/keys/share`, () =>
        HttpResponse.json({ error: "invalid_request", message: "no" }, { status: 400 }),
      ),
    );

    const { result } = renderHook(() => useSharing(sessionFor, mine.publicKey));

    await act(async () => {
      expect(await result.current.share(branchKeyId, "friend@example.com", "reader")).toBe(false);
    });

    expect(result.current.error).toMatch(/would not record that/);
  });

  it("rotates the key when somebody is removed", async () => {
    const { branchKeyId } = await seedWorkspace();
    const database = await getNotesDb();
    const recorded: { keys: { id: string; rotatedFrom: string | null }[] }[] = [];

    server.use(
      http.post(`${BASE}/v1/keys/revoke`, () => new HttpResponse(null, { status: 204 })),
      http.post(`${BASE}/v1/keys`, async ({ request }) => {
        recorded.push((await request.json()) as (typeof recorded)[number]);

        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${BASE}/v1/keys/${branchKeyId}/shares`, () => HttpResponse.json({ shares: [] })),
    );

    const { result } = renderHook(() => useSharing(sessionFor, mine.publicKey));

    await act(async () => {
      expect(await result.current.revoke(branchKeyId, "friend@example.com")).toBe(true);
    });
    expect(toast.notifySuccess).toHaveBeenCalledWith("Stopped sharing with friend@example.com");

    // A new key on the same edge, and the course's rows moved onto it: dropping the grant
    // stops the server serving those bytes, and only this stops a copy they kept opening.
    expect(recorded[0].keys[0].rotatedFrom).toBe(branchKeyId);

    const branch = (await database.getAll("branches"))[0];

    expect(branch.keyId).toBe(recorded[0].keys[0].id);
    expect(branch.keyId).not.toBe(branchKeyId);
  });

  it("hands the new key to everyone who keeps their access", async () => {
    const { branchKeyId } = await seedWorkspace();
    const staying = await identity();
    const reshared: { email: string; keyId: string }[] = [];

    server.use(
      http.get(`${BASE}/v1/keys/${branchKeyId}/shares`, () =>
        HttpResponse.json({
          shares: [
            { email: "gone@example.com", role: "reader" },
            { email: "staying@example.com", role: "writer" },
          ],
        }),
      ),
      http.post(`${BASE}/v1/keys/revoke`, () => new HttpResponse(null, { status: 204 })),
      http.post(`${BASE}/v1/keys`, () => new HttpResponse(null, { status: 204 })),
      http.get(`${BASE}/v1/users/public-key`, ({ request }) =>
        HttpResponse.json({
          email: new URL(request.url).searchParams.get("email"),
          publicKey: staying.publicKey,
        }),
      ),
      http.post(`${BASE}/v1/keys/share`, async ({ request }) => {
        reshared.push((await request.json()) as { email: string; keyId: string });

        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { result } = renderHook(() => useSharing(sessionFor, mine.publicKey));

    act(() => {
      result.current.select(branchKeyId);
    });
    await waitFor(() => {
      expect(result.current.shares).toHaveLength(2);
    });
    await act(async () => {
      await result.current.revoke(branchKeyId, "gone@example.com");
    });

    // Removing one person must not quietly remove all of them.
    expect(reshared.map((entry) => entry.email)).toEqual(["staying@example.com"]);
    expect(reshared[0].keyId).not.toBe(branchKeyId);
  });

  it("changes nothing when the server will not drop the grant", async () => {
    const { branchKeyId } = await seedWorkspace();
    const database = await getNotesDb();

    server.use(
      http.post(`${BASE}/v1/keys/revoke`, () =>
        HttpResponse.json({ error: "invalid_request", message: "no" }, { status: 400 }),
      ),
    );

    const { result } = renderHook(() => useSharing(sessionFor, mine.publicKey));

    await act(async () => {
      expect(await result.current.revoke(branchKeyId, "friend@example.com")).toBe(false);
    });

    expect(result.current.error).toMatch(/would not drop that/);
    expect((await database.getAll("branches"))[0].keyId).toBe(branchKeyId);
  });

  it("leaves the rows alone when the new key cannot be recorded", async () => {
    const { branchKeyId } = await seedWorkspace();
    const database = await getNotesDb();

    server.use(
      http.post(`${BASE}/v1/keys/revoke`, () => new HttpResponse(null, { status: 204 })),
      http.post(`${BASE}/v1/keys`, () =>
        HttpResponse.json({ error: "invalid_request", message: "no" }, { status: 400 }),
      ),
      http.get(`${BASE}/v1/keys/${branchKeyId}/shares`, () => HttpResponse.json({ shares: [] })),
    );

    const { result } = renderHook(() => useSharing(sessionFor, mine.publicKey));

    await act(async () => {
      await result.current.revoke(branchKeyId, "friend@example.com");
    });

    // A row sealed under a key nothing else knows about is a row no other device can open.
    expect((await database.getAll("branches"))[0].keyId).toBe(branchKeyId);
  });

  it("does nothing at all without a session", async () => {
    const { branchKeyId } = await seedWorkspace();
    const withoutToken = () => ({ baseUrl: BASE });

    const { result } = renderHook(() => useSharing(withoutToken, mine.publicKey));

    await act(async () => {
      expect(await result.current.share(branchKeyId, "friend@example.com", "reader")).toBe(false);
      expect(await result.current.revoke(branchKeyId, "friend@example.com")).toBe(false);
    });

    expect(result.current.error).toMatch(/Not connected/);
  });

  it("skips a row whose name it cannot open rather than failing the list", async () => {
    await seedWorkspace();
    const database = await getNotesDb();
    const branch = (await database.getAll("branches"))[0];

    // A course from somebody else's workspace, whose key this device was never given.
    await database.put("branches", { ...branch, id: "theirs", keyId: "a-key-nobody-gave-me" });

    const { result } = renderHook(() => useSharing(sessionFor, mine.publicKey));

    await waitFor(() => {
      expect(result.current.shareable.length).toBeGreaterThan(0);
    });

    expect(result.current.shareable.map((thing) => thing.keyId)).not.toContain(
      "a-key-nobody-gave-me",
    );
  });
});
