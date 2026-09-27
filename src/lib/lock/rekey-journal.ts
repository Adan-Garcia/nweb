import { kdfParamsSchema } from "@shared/kdf-params";
import { z } from "zod";

import { getNotesDb } from "../db/notes-db";

/**
 * The record of a rekey that has started and not finished.
 *
 * Without it, a rewrite that dies partway is unrecoverable: some rows are sealed with a
 * key that only existed in memory, the lock record was never written, and the app comes
 * back believing there is no passphrase while half its rows refuse to open. The journal
 * is written *before* the first row and cleared after the last, so its presence is
 * exactly "this workspace is mid-move", and it carries what is needed to finish the job —
 * the KDF parameters and verifier for both sides.
 *
 * The cursor is for speed, not correctness: the rewrite detects a row it has already
 * converted, so resuming from the wrong place costs time and never data.
 */
export const REKEY_JOURNAL_ID = "rekey";

/** The stores a rekey walks, in the order it walks them. The journal names one of these. */
export const REKEY_STORES = [
  "notes-documents",
  "notes-media",
  "notes-directory",
  "wings",
  "flights",
  "branches",
  "nests",
  "twigs",
  "pebbles",
  "feeds",
] as const;

export type RekeyStore = (typeof REKEY_STORES)[number];

/** One side of a rekey: what to derive that key from, or null for plaintext. */
export const rekeySideSchema = z
  .object({ kdf: kdfParamsSchema, keyId: z.string(), verifier: z.string() })
  .nullable();

export const rekeyJournalSchema = z.object({
  id: z.literal(REKEY_JOURNAL_ID),
  source: rekeySideSchema,
  target: rekeySideSchema,
  /** How far the sweep got: the store it was in, and the last key it finished there. */
  store: z.enum(REKEY_STORES),
  lastKey: z.string().nullable(),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  startedAt: z.number(),
});

export type RekeyJournal = z.infer<typeof rekeyJournalSchema>;
export type RekeySide = z.infer<typeof rekeySideSchema>;

/**
 * Which passphrases a resume has to ask for. A workspace being locked for the first time
 * only needs the new one; one being unlocked for good only needs the old one; one moving
 * between two passphrases needs both, because half its rows are under each.
 */
export function passphrasesNeeded(journal: RekeyJournal): ("source" | "target")[] {
  return [
    ...(journal.source ? (["source"] as const) : []),
    ...(journal.target ? (["target"] as const) : []),
  ];
}

export async function readRekeyJournal(): Promise<RekeyJournal | null> {
  const database = await getNotesDb();
  const stored = await database.get("workspace-rekey", REKEY_JOURNAL_ID);

  if (!stored) {
    return null;
  }

  const parsed = rekeyJournalSchema.safeParse(stored);

  if (!parsed.success) {
    throw new Error("A rekey was interrupted and its record is not one this version can read.");
  }

  return parsed.data;
}

export async function writeRekeyJournal(journal: RekeyJournal): Promise<void> {
  const database = await getNotesDb();
  await database.put("workspace-rekey", journal);
}

export async function clearRekeyJournal(): Promise<void> {
  const database = await getNotesDb();
  await database.delete("workspace-rekey", REKEY_JOURNAL_ID);
}
