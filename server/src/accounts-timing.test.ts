// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSession, register } from "./accounts";
import type { Sql } from "./db";
import { createTestDb } from "./test-db";

/**
 * How long a sign-in takes must not say whether the address has an account. The honest way
 * to hold that is for both answers to do the same work: one Argon2 verification each.
 * Timing itself is too noisy to assert on, so this counts the verifications instead.
 */
const argon2 = vi.hoisted(() => ({ verifications: 0, hashes: 0 }));

vi.mock("@node-rs/argon2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@node-rs/argon2")>();

  return {
    ...actual,
    hash: (...args: Parameters<typeof actual.hash>) => {
      argon2.hashes += 1;
      return actual.hash(...args);
    },
    verify: (...args: Parameters<typeof actual.verify>) => {
      argon2.verifications += 1;
      return actual.verify(...args);
    },
  };
});

let database: Sql & { close: () => Promise<void> };

beforeEach(async () => {
  database = await createTestDb();
  argon2.verifications = 0;
});

afterEach(async () => {
  await database.close();
});

describe("a sign-in", () => {
  it("does the same work for an address with no account as for a wrong proof", async () => {
    await register(database, {
      email: "student@example.com",
      authKey: "YXV0aC1rZXk",
      kdf: {
        name: "Argon2id",
        memorySize: 65_536,
        iterations: 3,
        parallelism: 1,
        salt: "c2FsdHktc2FsdC1oZXJlIQ==",
      },
      sealedAccountKey: "c2VhbGVkLWFjY291bnQta2V5LWJ5dGVz",
      publicKey: "cHVibGlj",
      sealedPrivateKey: "c2VhbGVkLXByaXZhdGUta2V5LWJ5dGVz",
    });

    expect(
      await createSession(database, { email: "student@example.com", authKey: "d3Jvbmc" }),
    ).toBeNull();
    const forExisting = argon2.verifications;

    expect(
      await createSession(database, { email: "nobody@example.com", authKey: "d3Jvbmc" }),
    ).toBeNull();

    expect(argon2.verifications - forExisting).toBe(forExisting);
  });

  it("hashes nothing on a miss once prepared, even the first after a restart", async () => {
    // A fresh module is a restarted process: nothing made yet.
    vi.resetModules();
    const unprepared = await import("./accounts");
    let before = argon2.hashes;

    await unprepared.createSession(database, { email: "nobody@example.com", authKey: "d3Jvbmc" });
    // What the fix is for: unprepared, the first miss also pays for making the hash.
    expect(argon2.hashes - before).toBe(1);

    vi.resetModules();
    const restarted = await import("./accounts");
    await restarted.prepareSignIn();
    before = argon2.hashes;

    expect(
      await restarted.createSession(database, { email: "nobody@example.com", authKey: "d3Jvbmc" }),
    ).toBeNull();
    expect(argon2.hashes).toBe(before);
  });
});
