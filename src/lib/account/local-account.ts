import { z } from "zod";

import { getNotesDb } from "../db/notes-db";

/**
 * Who this device belongs to. Required before the workspace opens.
 *
 * The passphrase is not here: it is the lock (`lock/workspace-lock.ts`), and with a server
 * account also the account's (`account-record.ts`). This row is the name the app greets
 * someone by and the address a server account would use, and nothing secret.
 *
 * Kept in the clear on purpose. The lock screen shows the name before anything is
 * unlocked, which is the one time it is useful; the email is the same one a server account
 * already sends in the clear to sign in.
 */
export const LOCAL_ACCOUNT_ID = "self";

export const localAccountSchema = z.object({
  id: z.literal(LOCAL_ACCOUNT_ID),
  name: z.string().trim().min(1).max(80),
  email: z.email(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type LocalAccount = z.infer<typeof localAccountSchema>;

export type LocalAccountProfile = Pick<LocalAccount, "name" | "email">;

/** Parsed rather than trusted; a row this build cannot read is treated as an error. */
export async function readLocalAccount(): Promise<LocalAccount | null> {
  const database = await getNotesDb();
  const stored: unknown = await database.get("local-account", LOCAL_ACCOUNT_ID);

  return stored ? localAccountSchema.parse(stored) : null;
}

/** Creates or updates the profile, keeping when it was first made. */
export async function writeLocalAccount(
  profile: LocalAccountProfile,
  now: number = Date.now(),
): Promise<LocalAccount> {
  const database = await getNotesDb();
  const existing = await readLocalAccount();
  const next = localAccountSchema.parse({
    id: LOCAL_ACCOUNT_ID,
    name: profile.name,
    email: profile.email,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  await database.put("local-account", next);

  return next;
}
