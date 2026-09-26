import type { KeyKind } from "@shared/sharing-contract";

import type { Branch, Flight, Nest, Wing } from "./entity-model";
import { isReadOnlyKey } from "./keys/access";
import { cipherForObject } from "./keys/object-keys";
import { getNotesDb } from "./notes-db";
import { openRow, openText, type SealedRow, sealRow } from "./sealed-text";
import {
  emptySharePath,
  type SharePath,
  type SharePathRecord,
  sharePathSchema,
} from "./share-path-model";

/**
 * Writing and reading the path above a shared thing. See `share-path-model.ts` for why it
 * exists; this is the storage module, so it seals on the way in and opens on the way out.
 */
type Located = { kind: KeyKind; id: string; path: SharePath; complete: boolean };

type Named = { name: string; deletedAt: number | null } & SealedRow;

/** One row on the path, opened, or null where it is missing or cannot be read here. */
async function opened<Row extends Named>(row: Row | undefined): Promise<Row | null> {
  if (!row || row.deletedAt) {
    return null;
  }

  try {
    return await openRow(row, "name");
  } catch {
    return null;
  }
}

/**
 * Walks up from the level named and collects each name on the way. `complete` is whether
 * the walk reached a wing: a path that stops short is one this device cannot see all of,
 * and must never replace a longer one somebody else wrote.
 */
async function walkUp(start: {
  branchId?: string;
  flightId?: string;
  wingId?: string;
}): Promise<{ path: SharePath; complete: boolean }> {
  const database = await getNotesDb();
  const path = emptySharePath();
  let { flightId, wingId } = start;

  if (start.branchId) {
    const branch: Branch | null = await opened(await database.get("branches", start.branchId));

    if (!branch) {
      return { path, complete: false };
    }

    path.branches.push(branch);
    flightId = branch.flightId;
  }

  if (flightId) {
    const flight: Flight | null = await opened(await database.get("flights", flightId));

    if (!flight) {
      return { path, complete: false };
    }

    path.flights.push(flight);
    wingId = flight.wingId;
  }

  const wing: Wing | null = wingId ? await opened(await database.get("wings", wingId)) : null;

  if (wing) {
    path.wings.push(wing);
  }

  return { path, complete: Boolean(wing) };
}

/** Finds whatever carries this key and the names above it. Null for a key on no row here. */
async function locate(objectKeyId: string): Promise<Located | null> {
  const database = await getNotesDb();
  const byKey = <Row extends { keyId?: string }>(rows: Row[]) =>
    rows.find((row) => row.keyId === objectKeyId);

  const note = byKey(await database.getAll("notes-directory"));

  if (note) {
    const above = await walkUp({ branchId: note.branchId });
    // A note's tags are part of where it is: the path bar navigates by them.
    const nests = await Promise.all(note.nestIds.map((id) => database.get("nests", id)));

    for (const nest of nests) {
      const tag: Nest | null = await opened(nest);

      if (tag) {
        above.path.nests.push(tag);
      }
    }

    return { kind: "feather", id: note.id, ...above };
  }

  const nest = byKey(await database.getAll("nests"));

  if (nest) {
    return { kind: "nest", id: nest.id, ...(await walkUp({ branchId: nest.branchId })) };
  }

  const branch = byKey(await database.getAll("branches"));

  if (branch) {
    return { kind: "branch", id: branch.id, ...(await walkUp({ flightId: branch.flightId })) };
  }

  const flight = byKey(await database.getAll("flights"));

  return flight
    ? { kind: "flight", id: flight.id, ...(await walkUp({ wingId: flight.wingId })) }
    : null;
}

async function readPath(record: SharePathRecord): Promise<SharePath | null> {
  try {
    const parsed = sharePathSchema.safeParse(
      JSON.parse(await openText(record.path, record)) as unknown,
    );

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Records the path above the object this key belongs to, when this device can see all of
 * it. Called when something is shared, and every sync round for what already has one, so a
 * renamed course reaches the people it was shared with.
 *
 * Sealed under the object's own key or not written at all: under any other key it would
 * either reach nobody or reach people who were never given the object.
 */
export async function writeSharePath(objectKeyId: string): Promise<boolean> {
  const cipher = cipherForObject(objectKeyId);
  const found = await locate(objectKeyId);

  if (!found?.complete || cipher.keyId !== objectKeyId) {
    return false;
  }

  const database = await getNotesDb();
  const existing = await database.get("share-paths", found.id);
  const text = JSON.stringify(found.path);

  // Compared in the shape a read gives back, so field order is never mistaken for a change.
  if (
    existing &&
    !existing.deletedAt &&
    JSON.stringify(await readPath(existing)) === JSON.stringify(sharePathSchema.parse(found.path))
  ) {
    return false;
  }

  await database.put(
    "share-paths",
    await sealRow(
      { id: found.id, kind: found.kind, path: text, updatedAt: Date.now(), deletedAt: null },
      "path",
      cipher,
    ),
  );

  return true;
}

/** Brings every recorded path up to date with the names this device can see now. */
export async function refreshSharePaths(): Promise<number> {
  const database = await getNotesDb();
  let written = 0;

  for (const record of await database.getAll("share-paths")) {
    if (!record.deletedAt && record.keyId && !isReadOnlyKey(record.keyId)) {
      written += Number(await writeSharePath(record.keyId));
    }
  }

  return written;
}

/**
 * Every name on every path this device holds, merged. The same wing reached from two
 * shared notes is one wing, so rows are kept by id.
 */
export async function listSharePathEntities(): Promise<SharePath> {
  const database = await getNotesDb();
  const merged = emptySharePath();
  const seen = new Set<string>();

  const fresh = <Row extends { id: string }>(rows: Row[] | undefined) =>
    (rows ?? []).filter((row) => !seen.has(row.id) && Boolean(seen.add(row.id)));

  for (const record of await database.getAll("share-paths")) {
    const path = record.deletedAt ? null : await readPath(record);

    merged.wings.push(...fresh(path?.wings));
    merged.flights.push(...fresh(path?.flights));
    merged.branches.push(...fresh(path?.branches));
    merged.nests.push(...fresh(path?.nests));
  }

  return merged;
}
