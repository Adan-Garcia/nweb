import type { KeyGraph } from "@shared/sharing-contract";
import { describe, expect, it } from "vitest";

import { bytesToBase64 } from "../base64";
import {
  cipherForKey,
  createObjectKey,
  type Keyring,
  mergeKeyGraphs,
  openKeyGraph,
  wrapForRecipient,
  wrapUnderParent,
} from "./key-graph";

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

/**
 * A course, a tag under it, a note carrying that tag, and a note that does not. The same
 * shape the server test uses, built with real keys.
 */
async function seedWorkspace() {
  const branch = await createObjectKey("branch");
  const nest = await createObjectKey("nest");
  const tagged = await createObjectKey("feather");
  const plain = await createObjectKey("feather");

  const wraps = [
    {
      parentKeyId: branch.keyId,
      childKeyId: nest.keyId,
      wrapped: await wrapUnderParent(nest.key, branch.key),
    },
    {
      parentKeyId: branch.keyId,
      childKeyId: tagged.keyId,
      wrapped: await wrapUnderParent(tagged.key, branch.key),
    },
    {
      parentKeyId: nest.keyId,
      childKeyId: tagged.keyId,
      wrapped: await wrapUnderParent(tagged.key, nest.key),
    },
    {
      parentKeyId: branch.keyId,
      childKeyId: plain.keyId,
      wrapped: await wrapUnderParent(plain.key, branch.key),
    },
  ];

  const keys: KeyGraph["keys"] = [branch, nest, tagged, plain].map((object) => ({
    id: object.keyId,
    kind: object.kind,
    rotatedFrom: null,
  }));

  return { branch, nest, tagged, plain, keys, wraps };
}

/** Proves a keyring holds the key that sealed something, without either being readable. */
async function opens(keyring: Keyring, keyId: string, sealedBy: CryptoKey) {
  const cipher = cipherForKey(keyring, keyId);

  if (!cipher) {
    return false;
  }

  const iv = new Uint8Array(12).fill(9);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sealedBy,
    new TextEncoder().encode("marker"),
  );

  try {
    const key = keyring.get(keyId)!;
    const opened = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealed);

    return new TextDecoder().decode(opened) === "marker";
  } catch {
    return false;
  }
}

describe("openKeyGraph", () => {
  it("derives everything below the key it was granted", async () => {
    const me = await identity();
    const { branch, nest, tagged, plain, keys, wraps } = await seedWorkspace();

    const keyring = await openKeyGraph(
      {
        keys,
        wraps,
        grants: [
          {
            keyId: branch.keyId,
            role: "writer",
            wrapped: await wrapForRecipient(branch.key, me.publicKey),
          },
        ],
      },
      me.privateKey,
    );

    expect([...keyring.keys()].sort()).toEqual(
      [branch.keyId, nest.keyId, tagged.keyId, plain.keyId].sort(),
    );
    expect(await opens(keyring, tagged.keyId, tagged.key)).toBe(true);
  });

  it("gives a tag and the note in it, and nothing above either", async () => {
    const friend = await identity();
    const { branch, nest, tagged, plain, keys, wraps } = await seedWorkspace();

    const keyring = await openKeyGraph(
      {
        keys,
        wraps,
        grants: [
          {
            keyId: nest.keyId,
            role: "reader",
            wrapped: await wrapForRecipient(nest.key, friend.publicKey),
          },
        ],
      },
      friend.privateKey,
    );

    expect([...keyring.keys()].sort()).toEqual([nest.keyId, tagged.keyId].sort());
    // The course above it and the note that was never tagged stay shut, even though the
    // wraps that mention them were in the graph.
    expect(cipherForKey(keyring, branch.keyId)).toBeNull();
    expect(cipherForKey(keyring, plain.keyId)).toBeNull();
  });

  it("gives one note and no route to anything else", async () => {
    const friend = await identity();
    const { plain, branch, keys, wraps } = await seedWorkspace();

    const keyring = await openKeyGraph(
      {
        keys,
        wraps,
        grants: [
          {
            keyId: plain.keyId,
            role: "reader",
            wrapped: await wrapForRecipient(plain.key, friend.publicKey),
          },
        ],
      },
      friend.privateKey,
    );

    expect([...keyring.keys()]).toEqual([plain.keyId]);
    expect(cipherForKey(keyring, branch.keyId)).toBeNull();
  });

  it("reaches a note through whichever route it was given", async () => {
    const viaNest = await identity();
    const { nest, tagged, keys, wraps } = await seedWorkspace();

    // The note hangs off both the course and the tag. A grant on the tag alone still
    // opens it, which is what makes a tag shareable as if it were a level.
    const keyring = await openKeyGraph(
      {
        keys,
        wraps,
        grants: [
          {
            keyId: nest.keyId,
            role: "reader",
            wrapped: await wrapForRecipient(nest.key, viaNest.publicKey),
          },
        ],
      },
      viaNest.privateKey,
    );

    expect(await opens(keyring, tagged.keyId, tagged.key)).toBe(true);
  });

  it("derives nothing from a graph it holds no grant in", async () => {
    const stranger = await identity();
    const { keys, wraps } = await seedWorkspace();

    const keyring = await openKeyGraph({ keys, wraps, grants: [] }, stranger.privateKey);

    expect(keyring.size).toBe(0);
  });

  it("skips a grant that was sealed for somebody else", async () => {
    const me = await identity();
    const other = await identity();
    const { branch, keys, wraps } = await seedWorkspace();

    const keyring = await openKeyGraph(
      {
        keys,
        wraps,
        grants: [
          {
            keyId: branch.keyId,
            role: "reader",
            wrapped: await wrapForRecipient(branch.key, other.publicKey),
          },
        ],
      },
      me.privateKey,
    );

    expect(keyring.size).toBe(0);
  });

  it("skips a wrap that will not open rather than stopping the walk", async () => {
    const me = await identity();
    const { branch, nest, plain, keys, wraps } = await seedWorkspace();

    const tampered = wraps.map((wrap) =>
      wrap.childKeyId === nest.keyId ? { ...wrap, wrapped: "bm90IGEgd3JhcA" } : wrap,
    );

    const keyring = await openKeyGraph(
      {
        keys,
        wraps: tampered,
        grants: [
          {
            keyId: branch.keyId,
            role: "writer",
            wrapped: await wrapForRecipient(branch.key, me.publicKey),
          },
        ],
      },
      me.privateKey,
    );

    // The tag is lost; everything else under the course still comes through.
    expect(keyring.has(nest.keyId)).toBe(false);
    expect(keyring.has(plain.keyId)).toBe(true);
  });

  it("ignores a wrap whose parent it cannot derive, however it got there", async () => {
    const friend = await identity();
    const { branch, nest, tagged, keys, wraps } = await seedWorkspace();

    // A server that handed over more of the graph than it should have. The extra wraps
    // are bytes, and bytes without the key above them are nothing.
    const keyring = await openKeyGraph(
      {
        keys,
        wraps,
        grants: [
          {
            keyId: tagged.keyId,
            role: "reader",
            wrapped: await wrapForRecipient(tagged.key, friend.publicKey),
          },
        ],
      },
      friend.privateKey,
    );

    expect([...keyring.keys()]).toEqual([tagged.keyId]);
    expect(cipherForKey(keyring, branch.keyId)).toBeNull();
    expect(cipherForKey(keyring, nest.keyId)).toBeNull();
  });
});

describe("cipherForKey", () => {
  it("names the key it came from, so a row it seals says which one to use", async () => {
    const me = await identity();
    const { branch, keys, wraps } = await seedWorkspace();

    const keyring = await openKeyGraph(
      {
        keys,
        wraps,
        grants: [
          {
            keyId: branch.keyId,
            role: "writer",
            wrapped: await wrapForRecipient(branch.key, me.publicKey),
          },
        ],
      },
      me.privateKey,
    );

    const cipher = cipherForKey(keyring, branch.keyId)!;

    expect(cipher.keyId).toBe(branch.keyId);
    expect(cipher.name).toBe("aes-gcm");
  });
});

describe("mergeKeyGraphs", () => {
  const graph = (keys: string[], grants: string[] = []): KeyGraph => ({
    keys: keys.map((id) => ({ id, kind: "branch" as const, rotatedFrom: null })),
    wraps: keys.map((id) => ({ parentKeyId: "root", childKeyId: id, wrapped: `w-${id}` })),
    grants: grants.map((id) => ({ keyId: id, role: "reader" as const, wrapped: `g-${id}` })),
  });

  it("is the server's answer when this device has cached nothing", () => {
    expect(mergeKeyGraphs(null, graph(["a"]))).toEqual(graph(["a"]));
  });

  it("keeps a key minted here that the server has not been told about yet", () => {
    const merged = mergeKeyGraphs(graph(["mine"]), graph(["theirs"]));

    // A refresh that lands before the upload must not forget the local key, or it becomes
    // underivable on the next cold load.
    expect(merged.keys.map((key) => key.id).sort()).toEqual(["mine", "theirs"]);
    expect(merged.wraps).toHaveLength(2);
  });

  it("keeps a grant somebody made to you, which was never yours to record", () => {
    const merged = mergeKeyGraphs(graph(["mine"]), graph(["shared"], ["shared"]));

    expect(merged.grants.map((grant) => grant.keyId)).toEqual(["shared"]);
  });

  it("lets the server's copy win where both describe the same thing", () => {
    const merged = mergeKeyGraphs(graph(["a"], ["a"]), {
      ...graph(["a"], ["a"]),
      grants: [{ keyId: "a", role: "writer", wrapped: "fresher" }],
    });

    expect(merged.grants).toEqual([{ keyId: "a", role: "writer", wrapped: "fresher" }]);
    expect(merged.keys).toHaveLength(1);
  });
});
