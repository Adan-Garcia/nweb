import { cipherNameSchema } from "@shared/cipher-name";
import { KEY_KINDS } from "@shared/sharing-contract";
import { z } from "zod";

import { branchSchema, flightSchema, nestSchema, wingSchema } from "./entity-model";

/**
 * The path above something shared, and nothing beside it.
 *
 * Sharing a note hands over the note's key. The course, term and wing it sits in are under
 * keys of their own, and handing *those* over would open every sibling too — so the
 * recipient would otherwise know the note and not where it lives. This record is the
 * middle ground: a copy of just the names on the way down, sealed under the shared thing's
 * own key. Anyone who can read the note can read where it is; nobody learns what else is
 * there.
 *
 * One record per shared object, keyed by that object's id, and synced like any other row —
 * the server files it under the object's key, so it reaches exactly the people the object
 * does and is re-sent whenever a new grant is made.
 */
export const sharePathRecordSchema = z.object({
  /** The shared object's own id: a branch, a nest or a note. */
  id: z.string(),
  kind: z.enum(KEY_KINDS),
  /** A `SharePath`, as JSON, sealed like any other display field. */
  path: z.string(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable().default(null),
  encryption: cipherNameSchema.optional(),
  keyId: z.string().optional(),
});

export type SharePathRecord = z.infer<typeof sharePathRecordSchema>;

/** The rows inside a path carry no seal of their own: the record around them is sealed. */
const UNSEALED = { encryption: true, keyId: true } as const;

export const sharePathSchema = z.object({
  wings: z.array(wingSchema.omit(UNSEALED)),
  flights: z.array(flightSchema.omit(UNSEALED)),
  branches: z.array(branchSchema.omit(UNSEALED)),
  nests: z.array(nestSchema.omit(UNSEALED)),
});

export type SharePath = z.infer<typeof sharePathSchema>;

export function emptySharePath(): SharePath {
  return { wings: [], flights: [], branches: [], nests: [] };
}
