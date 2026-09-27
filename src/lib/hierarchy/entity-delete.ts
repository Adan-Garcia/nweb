import { getNotesDb } from "../db/notes-db";
import { isReadOnlyKey } from "../keys/access";

export type EntityDeleteSummary = {
  flights: number;
  branches: number;
  nests: number;
  notes: number;
  twigs: number;
  pebbles: number;
};

const EMPTY_SUMMARY: EntityDeleteSummary = {
  flights: 0,
  branches: 0,
  nests: 0,
  notes: 0,
  twigs: 0,
  pebbles: 0,
};

const CASCADE_STORES = [
  "wings",
  "flights",
  "branches",
  "nests",
  "notes-directory",
  "notes-documents",
  "notes-media",
  "twigs",
  "pebbles",
] as const;

/**
 * Deleting a level of the hierarchy tombstones everything under it in one transaction.
 *
 * Every record is tombstoned rather than removed, for the reason a deleted note is: a
 * future sync has to tell "deleted here" from "never created here". The exception is the
 * bytes — note documents and the media they own — which are dropped outright, because a
 * tombstone that kept them would grow the database forever with content nothing reaches.
 */
async function cascadeDelete(scope: {
  kind: "wing" | "flight" | "branch";
  id: string;
}): Promise<EntityDeleteSummary | null> {
  const database = await getNotesDb();
  const transaction = database.transaction(CASCADE_STORES, "readwrite");

  const wingStore = transaction.objectStore("wings");
  const flightStore = transaction.objectStore("flights");
  const branchStore = transaction.objectStore("branches");
  const nestStore = transaction.objectStore("nests");
  const directoryStore = transaction.objectStore("notes-directory");
  const documentStore = transaction.objectStore("notes-documents");
  const mediaStore = transaction.objectStore("notes-media");
  const twigStore = transaction.objectStore("twigs");
  const pebbleStore = transaction.objectStore("pebbles");

  const deletedAt = Date.now();
  const summary = { ...EMPTY_SUMMARY };

  const tombstone = <T extends { deletedAt: number | null }>(row: T): T => ({
    ...row,
    deletedAt,
    updatedAt: deletedAt,
  });

  const flightIds = new Set<string>();
  const branchIds = new Set<string>();

  if (scope.kind === "wing") {
    const wing = await wingStore.get(scope.id);

    if (!wing || wing.deletedAt || isReadOnlyKey(wing.keyId)) {
      await transaction.done;
      return null;
    }

    await wingStore.put(tombstone(wing));

    for (const flight of await flightStore.getAll()) {
      if (flight.wingId === scope.id && !flight.deletedAt) {
        flightIds.add(flight.id);
        await flightStore.put(tombstone(flight));
        summary.flights += 1;
      }
    }
  }

  if (scope.kind === "flight") {
    const flight = await flightStore.get(scope.id);

    if (!flight || flight.deletedAt || isReadOnlyKey(flight.keyId)) {
      await transaction.done;
      return null;
    }

    flightIds.add(flight.id);
    await flightStore.put(tombstone(flight));
    summary.flights += 1;
  }

  if (scope.kind === "branch") {
    const branch = await branchStore.get(scope.id);

    if (!branch || branch.deletedAt || isReadOnlyKey(branch.keyId)) {
      await transaction.done;
      return null;
    }

    branchIds.add(branch.id);
    await branchStore.put(tombstone(branch));
    summary.branches += 1;
  } else {
    for (const branch of await branchStore.getAll()) {
      if (flightIds.has(branch.flightId) && !branch.deletedAt) {
        branchIds.add(branch.id);
        await branchStore.put(tombstone(branch));
        summary.branches += 1;
      }
    }
  }

  for (const nest of await nestStore.getAll()) {
    if (branchIds.has(nest.branchId) && !nest.deletedAt) {
      await nestStore.put(tombstone(nest));
      summary.nests += 1;
    }
  }

  const doomedMediaIds = new Set<string>();

  for (const entry of await directoryStore.getAll()) {
    if (!branchIds.has(entry.branchId) || entry.deletedAt) {
      continue;
    }

    const documentRecord = await documentStore.get(entry.id);

    for (const sceneFile of documentRecord?.sceneFiles ?? []) {
      doomedMediaIds.add(sceneFile.id);
    }

    await documentStore.delete(entry.id);
    await directoryStore.put(tombstone(entry));
    summary.notes += 1;
  }

  for (const twig of await twigStore.getAll()) {
    if (branchIds.has(twig.branchId) && !twig.deletedAt) {
      await twigStore.put(tombstone(twig));
      summary.twigs += 1;
    }
  }

  for (const pebble of await pebbleStore.getAll()) {
    if (branchIds.has(pebble.branchId) && !pebble.deletedAt) {
      doomedMediaIds.add(pebble.mediaId);
      await pebbleStore.put(tombstone(pebble));
      summary.pebbles += 1;
    }
  }

  // Only the media nothing points at any more. Excalidraw derives a file's id from its
  // contents, so one picture dropped into two notes is one row: dropping it with either
  // note would leave the survivor rendering without it.
  if (doomedMediaIds.size) {
    const stillReferenced = new Set<string>();

    for (const documentRecord of await documentStore.getAll()) {
      for (const sceneFile of documentRecord.sceneFiles) {
        stillReferenced.add(sceneFile.id);
      }
    }

    for (const pebble of await pebbleStore.getAll()) {
      if (!pebble.deletedAt) {
        stillReferenced.add(pebble.mediaId);
      }
    }

    for (const mediaId of doomedMediaIds) {
      if (!stillReferenced.has(mediaId)) {
        await mediaStore.delete(mediaId);
      }
    }
  }

  await transaction.done;

  return summary;
}

export function softDeleteWing(id: string) {
  return cascadeDelete({ kind: "wing", id });
}

export function softDeleteFlight(id: string) {
  return cascadeDelete({ kind: "flight", id });
}

export function softDeleteBranch(id: string) {
  return cascadeDelete({ kind: "branch", id });
}

/**
 * A nest is a tag, so deleting one does not delete what it marked: the tag is tombstoned
 * and lifted off every note, twig and pebble that carried it.
 */
export async function softDeleteNest(id: string): Promise<boolean> {
  const database = await getNotesDb();
  const transaction = database.transaction(
    ["nests", "notes-directory", "twigs", "pebbles"],
    "readwrite",
  );

  const nestStore = transaction.objectStore("nests");
  const nest = await nestStore.get(id);

  if (!nest || nest.deletedAt || isReadOnlyKey(nest.keyId)) {
    await transaction.done;
    return false;
  }

  const deletedAt = Date.now();
  await nestStore.put({ ...nest, deletedAt, updatedAt: deletedAt });

  const directoryStore = transaction.objectStore("notes-directory");
  const twigStore = transaction.objectStore("twigs");
  const pebbleStore = transaction.objectStore("pebbles");

  for (const entry of await directoryStore.getAll()) {
    if (entry.nestIds.includes(id)) {
      await directoryStore.put({
        ...entry,
        nestIds: entry.nestIds.filter((nestId) => nestId !== id),
        updatedAt: deletedAt,
      });
    }
  }

  for (const twig of await twigStore.getAll()) {
    if (twig.nestIds.includes(id)) {
      await twigStore.put({
        ...twig,
        nestIds: twig.nestIds.filter((nestId) => nestId !== id),
        updatedAt: deletedAt,
      });
    }
  }

  for (const pebble of await pebbleStore.getAll()) {
    if (pebble.nestIds.includes(id)) {
      await pebbleStore.put({
        ...pebble,
        nestIds: pebble.nestIds.filter((nestId) => nestId !== id),
        updatedAt: deletedAt,
      });
    }
  }

  await transaction.done;
  return true;
}
