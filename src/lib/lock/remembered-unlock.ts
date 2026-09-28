import { z } from "zod";

import { getNotesDb } from "../db/notes-db";

/**
 * "Keep me signed in": the keys an unlock put in memory, kept on this device so the next
 * load can skip the passphrase.
 *
 * This is the one deliberate exception to "the key lives in memory only", taken only when
 * someone ticks the box. What is kept is as narrow as it can be:
 * - Keys are stored as `CryptoKey` objects re-imported non-extractable, so a script on this
 *   origin can use them but never read their bytes, and a copied profile yields a handle
 *   rather than key material in the clear.
 * - On a device with a sync account, the passphrase-derived sign-in proof is kept as well,
 *   so sync reconnects on its own. The session token it buys still lives in memory only.
 * - It lapses after `REMEMBER_DAYS`, and locking, a new passphrase or erasing the device
 *   forgets it at once.
 *
 * It lives in a store of its own that neither syncs nor goes into a backup.
 */
export const REMEMBER_DAYS = 30;

const REMEMBERED_ID = "self";
const DAY_MS = 24 * 60 * 60 * 1000;

const cryptoKeySchema = z.custom<CryptoKey>((value) => value instanceof CryptoKey);

export const rememberedUnlockSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.literal(REMEMBERED_ID),
    kind: z.literal("lock"),
    expiresAt: z.number(),
    key: cryptoKeySchema,
    keyId: z.string(),
  }),
  z.object({
    id: z.literal(REMEMBERED_ID),
    kind: z.literal("account"),
    expiresAt: z.number(),
    wingKey: cryptoKeySchema,
    wingKeyId: z.string(),
    privateKey: cryptoKeySchema,
    authKey: z.string(),
  }),
]);

export type RememberedUnlock = z.infer<typeof rememberedUnlockSchema>;

type Remembered<Kind extends RememberedUnlock["kind"]> = Omit<
  Extract<RememberedUnlock, { kind: Kind }>,
  "id" | "kind" | "expiresAt"
>;

/** The same key, usable and no longer exportable. */
async function sealedCopy(key: CryptoKey, format: "raw" | "pkcs8"): Promise<CryptoKey> {
  if (!key.extractable) {
    return key;
  }

  return crypto.subtle.importKey(
    format,
    await crypto.subtle.exportKey(format, key),
    key.algorithm,
    false,
    key.usages,
  );
}

export async function rememberLockUnlock(
  unlock: Remembered<"lock">,
  now = Date.now(),
): Promise<void> {
  // The copy is made before the transaction opens: awaiting anything else inside one would
  // let it commit early.
  const key = await sealedCopy(unlock.key, "raw");
  const database = await getNotesDb();

  await database.put("remembered-unlock", {
    ...unlock,
    key,
    id: REMEMBERED_ID,
    kind: "lock",
    expiresAt: now + REMEMBER_DAYS * DAY_MS,
  });
}

export async function rememberAccountUnlock(
  unlock: Remembered<"account">,
  now = Date.now(),
): Promise<void> {
  const [wingKey, privateKey] = await Promise.all([
    sealedCopy(unlock.wingKey, "raw"),
    sealedCopy(unlock.privateKey, "pkcs8"),
  ]);
  const database = await getNotesDb();

  await database.put("remembered-unlock", {
    ...unlock,
    wingKey,
    privateKey,
    id: REMEMBERED_ID,
    kind: "account",
    expiresAt: now + REMEMBER_DAYS * DAY_MS,
  });
}

/** What was remembered, unless it has lapsed or does not parse — in which case it goes. */
export async function readRememberedUnlock(now = Date.now()): Promise<RememberedUnlock | null> {
  const database = await getNotesDb();
  const stored: unknown = await database.get("remembered-unlock", REMEMBERED_ID);

  if (stored === undefined) {
    return null;
  }

  const parsed = rememberedUnlockSchema.safeParse(stored);

  if (!parsed.success || parsed.data.expiresAt <= now) {
    await forgetRememberedUnlock();
    return null;
  }

  return parsed.data;
}

export async function forgetRememberedUnlock(): Promise<void> {
  const database = await getNotesDb();

  await database.delete("remembered-unlock", REMEMBERED_ID);
}
