import type { KeyKind } from "@shared/sharing-contract";

import { openText } from "../crypto/sealed-text";
import { getNotesDb } from "../db/notes-db";

/**
 * The things this workspace can hand over, with the key that hands each one over.
 *
 * Sharing is not a level in the hierarchy; it is any object that has a key. So this is a
 * flat list of everything that does, labelled with what it is called and what kind of thing
 * it is, and the screen decides how to group it.
 *
 * A row with no `keyId` is not shareable and is left out rather than shown greyed: it
 * belongs to a workspace with no account, where there is nobody to share with.
 */
export type Shareable = {
  keyId: string;
  kind: KeyKind;
  name: string;
  /** What it sits in, for a label that says "Entropy — Thermodynamics" rather than just one. */
  within: string | null;
};

type Named = {
  id: string;
  keyId?: string;
  encryption?: "none" | "aes-gcm";
  deletedAt: number | null;
};

/** Opens one display name, or gives up on it: a list must not fail over one bad row. */
async function nameOf<Row extends Named>(row: Row, value: string): Promise<string | null> {
  try {
    return await openText(value, row);
  } catch {
    return null;
  }
}

/**
 * Everything shareable, newest containers first.
 *
 * Courses and tags come before notes and tasks because that is the order someone thinks in:
 * you share a course, and occasionally one note out of it.
 */
export async function listShareable(): Promise<Shareable[]> {
  const database = await getNotesDb();
  const [branches, nests, notes] = await Promise.all([
    database.getAll("branches"),
    database.getAll("nests"),
    database.getAll("notes-directory"),
  ]);

  const branchNames = new Map<string, string>();
  const shareable: Shareable[] = [];

  for (const branch of branches) {
    const name = branch.deletedAt ? null : await nameOf(branch, branch.name);

    if (name) {
      branchNames.set(branch.id, name);
    }

    if (name && branch.keyId) {
      shareable.push({ keyId: branch.keyId, kind: "branch", name, within: null });
    }
  }

  for (const nest of nests) {
    const name = nest.deletedAt ? null : await nameOf(nest, nest.name);

    if (name && nest.keyId) {
      shareable.push({
        keyId: nest.keyId,
        kind: "nest",
        name,
        within: branchNames.get(nest.branchId) ?? null,
      });
    }
  }

  for (const note of notes) {
    const name = note.deletedAt ? null : await nameOf(note, note.feather);

    if (name && note.keyId) {
      shareable.push({
        keyId: note.keyId,
        kind: "feather",
        name,
        within: branchNames.get(note.branchId) ?? null,
      });
    }
  }

  return shareable;
}

/** What each kind is called on screen. The vocabulary in code, plain language here. */
export const KIND_LABELS: Record<KeyKind, string> = {
  wing: "Workspace",
  flight: "Term",
  branch: "Course",
  nest: "Tag",
  feather: "Note",
  twig: "Task",
  pebble: "File",
};
