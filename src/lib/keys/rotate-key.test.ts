import type { KeyGraph } from "@shared/sharing-contract";
import { describe, expect, it } from "vitest";

import { bytesToBase64 } from "../crypto/base64";
import {
  createObjectKey,
  type Keyring,
  openKeyGraph,
  wrapForRecipient,
  wrapUnderParent,
} from "./key-graph";
import { planKeyRotation, reshareRotatedKey } from "./rotate-key";

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

/** A course with a tag under it and a note under the tag: one key with a parent and a child. */
async function seedGraph() {
  const branch = await createObjectKey("branch");
  const nest = await createObjectKey("nest");
  const note = await createObjectKey("feather");

  const wraps = [
    {
      parentKeyId: branch.keyId,
      childKeyId: nest.keyId,
      wrapped: await wrapUnderParent(nest.key, branch.key),
    },
    {
      parentKeyId: nest.keyId,
      childKeyId: note.keyId,
      wrapped: await wrapUnderParent(note.key, nest.key),
    },
  ];

  const keys: KeyGraph["keys"] = [branch, nest, note].map((object) => ({
    id: object.keyId,
    kind: object.kind,
    rotatedFrom: null,
  }));

  return { branch, nest, note, keys, wraps };
}

async function keyringFor(graph: KeyGraph, privateKey: CryptoKey): Promise<Keyring> {
  return openKeyGraph(graph, privateKey);
}

describe("planKeyRotation", () => {
  it("mints a key of the same kind, and says what it replaced", async () => {
    const me = await identity();
    const { nest, keys, wraps } = await seedGraph();
    const graph: KeyGraph = {
      keys,
      wraps,
      grants: [
        {
          keyId: nest.keyId,
          role: "writer",
          wrapped: await wrapForRecipient(nest.key, me.publicKey),
        },
      ],
    };

    const plan = await planKeyRotation({
      keyId: nest.keyId,
      graph,
      keyring: await keyringFor(graph, me.privateKey),
      publicKey: me.publicKey,
    });

    expect(plan?.upload.keys).toEqual([
      { id: plan?.cipher.keyId, kind: "nest", rotatedFrom: nest.keyId },
    ]);
    expect(plan?.previousKeyId).toBe(nest.keyId);
    expect(plan?.cipher.keyId).not.toBe(nest.keyId);
  });

  it("hangs the new key where the old one hung, so a course still reaches the tag", async () => {
    const me = await identity();
    const { branch, nest, note, keys, wraps } = await seedGraph();
    const graph: KeyGraph = {
      keys,
      wraps,
      grants: [
        {
          keyId: branch.keyId,
          role: "writer",
          wrapped: await wrapForRecipient(branch.key, me.publicKey),
        },
      ],
    };
    const keyring = await keyringFor(graph, me.privateKey);

    const plan = await planKeyRotation({
      keyId: nest.keyId,
      graph,
      keyring,
      publicKey: me.publicKey,
    });

    // Reachable from the course above it, and still reaching the note below it.
    expect(plan?.upload.wraps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parentKeyId: branch.keyId, childKeyId: plan?.cipher.keyId }),
        expect.objectContaining({ parentKeyId: plan?.cipher.keyId, childKeyId: note.keyId }),
      ]),
    );
  });

  it("produces a graph that still walks to the note after the swap", async () => {
    const me = await identity();
    const { branch, nest, note, keys, wraps } = await seedGraph();
    const graph: KeyGraph = {
      keys,
      wraps,
      grants: [
        {
          keyId: branch.keyId,
          role: "writer",
          wrapped: await wrapForRecipient(branch.key, me.publicKey),
        },
      ],
    };

    const plan = await planKeyRotation({
      keyId: nest.keyId,
      graph,
      keyring: await keyringFor(graph, me.privateKey),
      publicKey: me.publicKey,
    });

    // What the server would hold afterwards: the old tag key gone, the new one in its place.
    const rotated: KeyGraph = {
      keys: [...keys.filter((key) => key.id !== nest.keyId), ...(plan?.upload.keys ?? [])],
      wraps: [
        ...wraps.filter(
          (wrap) => wrap.parentKeyId !== nest.keyId && wrap.childKeyId !== nest.keyId,
        ),
        ...(plan?.upload.wraps ?? []),
      ],
      grants: graph.grants,
    };

    const after = await openKeyGraph(rotated, me.privateKey);

    expect(after.has(note.keyId)).toBe(true);
    expect(after.has(plan?.cipher.keyId ?? "")).toBe(true);
  });

  it("grants the new key to the person rotating it, keeping their role", async () => {
    const me = await identity();
    const { nest, keys, wraps } = await seedGraph();
    const graph: KeyGraph = {
      keys,
      wraps,
      grants: [
        {
          keyId: nest.keyId,
          role: "reader",
          wrapped: await wrapForRecipient(nest.key, me.publicKey),
        },
      ],
    };

    const plan = await planKeyRotation({
      keyId: nest.keyId,
      graph,
      keyring: await keyringFor(graph, me.privateKey),
      publicKey: me.publicKey,
    });

    expect(plan?.upload.grants[0]).toMatchObject({ keyId: plan?.cipher.keyId, role: "reader" });

    // The grant is a real wrap: opening the new graph with the private key yields the key.
    const derived = await openKeyGraph(
      { keys: plan?.upload.keys ?? [], wraps: [], grants: plan?.upload.grants ?? [] },
      me.privateKey,
    );

    expect(derived.has(plan?.cipher.keyId ?? "")).toBe(true);
  });

  it("writes a grant even for a key held only through a parent", async () => {
    const me = await identity();
    const { branch, nest, keys, wraps } = await seedGraph();
    const graph: KeyGraph = {
      keys,
      wraps,
      grants: [
        {
          keyId: branch.keyId,
          role: "writer",
          wrapped: await wrapForRecipient(branch.key, me.publicKey),
        },
      ],
    };

    const plan = await planKeyRotation({
      keyId: nest.keyId,
      graph,
      keyring: await keyringFor(graph, me.privateKey),
      publicKey: me.publicKey,
    });

    // There was no grant on the tag to copy a role from, so it defaults to the one that
    // can write: rotating something is not a reason to lose the ability to change it.
    expect(plan?.upload.grants[0]).toMatchObject({ role: "writer" });
  });

  it("refuses to rotate a key this device cannot derive", async () => {
    const stranger = await identity();
    const { nest, keys, wraps } = await seedGraph();

    const plan = await planKeyRotation({
      keyId: nest.keyId,
      graph: { keys, wraps, grants: [] },
      keyring: new Map(),
      publicKey: stranger.publicKey,
    });

    // Nothing to do and nothing safe to guess: the children would have to be wrapped under
    // the new key, and a key that will not open has no children anyone here can reach.
    expect(plan).toBeNull();
  });

  it("refuses a key the graph does not describe", async () => {
    const me = await identity();
    const { keys, wraps } = await seedGraph();

    const plan = await planKeyRotation({
      keyId: "a-key-that-is-not-here",
      graph: { keys, wraps, grants: [] },
      keyring: new Map(),
      publicKey: me.publicKey,
    });

    expect(plan).toBeNull();
  });

  it("skips an edge whose other end it cannot open", async () => {
    const me = await identity();
    const { nest, note, keys, wraps } = await seedGraph();
    // A graph handed over with the course in it, but no route to the course's key.
    const graph: KeyGraph = {
      keys,
      wraps,
      grants: [
        {
          keyId: nest.keyId,
          role: "writer",
          wrapped: await wrapForRecipient(nest.key, me.publicKey),
        },
      ],
    };

    const plan = await planKeyRotation({
      keyId: nest.keyId,
      graph,
      keyring: await keyringFor(graph, me.privateKey),
      publicKey: me.publicKey,
    });

    // The note below is re-wrapped; the course above is not, because wrapping the new key
    // under it would need the course's key, which this device does not have.
    expect(plan?.upload.wraps).toEqual([
      expect.objectContaining({ parentKeyId: plan?.cipher.keyId, childKeyId: note.keyId }),
    ]);
  });
});

describe("reshareRotatedKey", () => {
  it("wraps the new key for everyone who keeps their access", async () => {
    const me = await identity();
    const friend = await identity();
    const { nest, keys, wraps } = await seedGraph();
    const graph: KeyGraph = {
      keys,
      wraps,
      grants: [
        {
          keyId: nest.keyId,
          role: "writer",
          wrapped: await wrapForRecipient(nest.key, me.publicKey),
        },
      ],
    };

    const plan = await planKeyRotation({
      keyId: nest.keyId,
      graph,
      keyring: await keyringFor(graph, me.privateKey),
      publicKey: me.publicKey,
    });
    const reshares = await reshareRotatedKey(plan!, [
      { email: "friend@example.com", role: "reader", publicKey: friend.publicKey },
    ]);

    expect(reshares[0]).toMatchObject({
      keyId: plan?.cipher.keyId,
      email: "friend@example.com",
      role: "reader",
    });

    // Their wrap really opens: revoking one person must not lock out everybody else.
    const theirs = await openKeyGraph(
      {
        keys: plan?.upload.keys ?? [],
        wraps: [],
        grants: [{ keyId: reshares[0].keyId, role: "reader", wrapped: reshares[0].wrapped }],
      },
      friend.privateKey,
    );

    expect(theirs.has(plan?.cipher.keyId ?? "")).toBe(true);
  });

  it("hands nothing to nobody", async () => {
    const me = await identity();
    const { nest, keys, wraps } = await seedGraph();
    const graph: KeyGraph = {
      keys,
      wraps,
      grants: [
        {
          keyId: nest.keyId,
          role: "writer",
          wrapped: await wrapForRecipient(nest.key, me.publicKey),
        },
      ],
    };

    const plan = await planKeyRotation({
      keyId: nest.keyId,
      graph,
      keyring: await keyringFor(graph, me.privateKey),
      publicKey: me.publicKey,
    });

    expect(await reshareRotatedKey(plan!, [])).toEqual([]);
  });
});
