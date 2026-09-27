import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { startFakeSyncServer } from "@/test/fake-sync-server";
import { server } from "@/test/server";

import { setApiSession } from "../api/session-store";
import { resetActiveCipher } from "../crypto/cipher";
import { eraseNotesDb } from "../db/notes-db";
import { forgetKeyring } from "../keys/object-keys";
import { readAccountRecord } from "./account-record";
import { signInToServer } from "./server-connect";

/**
 * A server that tries to weaken the derivation. No cheap-KDF mock here, unlike the other
 * account suites: the floor under test is exactly what that mock turns off.
 */
beforeEach(async () => {
  resetActiveCipher();
  forgetKeyring();
  setApiSession(null);
  await eraseNotesDb();
});

describe("signing in to a server that asks for a weak derivation", () => {
  it("sends it nothing and says why", async () => {
    const fake = startFakeSyncServer();
    let proofs = 0;

    server.use(
      http.post(`${fake.baseUrl}/v1/auth/prelogin`, () =>
        HttpResponse.json({
          kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 1, salt: "c2FsdA" },
        }),
      ),
      http.post(`${fake.baseUrl}/v1/auth/session`, () => {
        proofs += 1;
        return HttpResponse.json({ error: "invalid_credentials", message: "no" }, { status: 401 });
      }),
    );

    expect(
      await signInToServer({
        email: "ada@example.com",
        passphrase: "correct horse battery",
        baseUrl: fake.baseUrl,
        mode: "merge",
      }),
    ).toEqual({ ok: false, reason: "untrusted-server" });

    expect(proofs).toBe(0);
    expect(await readAccountRecord()).toBeNull();
  });
});
