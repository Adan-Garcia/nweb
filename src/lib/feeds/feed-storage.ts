import { openRow, openRows, sealRow } from "../crypto/sealed-text";
import { getNotesDb } from "../db/notes-db";
import { cipherForObject } from "../keys/object-keys";
import {
  type Feed,
  type FeedMemory,
  type FeedRecord,
  feedRecordSchema,
  type FeedRun,
  type FeedSettings,
  feedSettingsSchema,
} from "./feed-model";

/**
 * Where feeds are kept: the `feeds` store, on this device only.
 *
 * The settings are sealed whole, as one JSON string, because every part of them is either
 * a secret (the address) or a name (a rule matching a course). What a refresh did — when,
 * how many, which error — stays readable beside them, so a list of feeds can say "last
 * refreshed an hour ago" on a locked workspace's behalf without opening anything.
 *
 * A feed is not synced. Its tasks are, and they carry ids derived from the event, so two
 * devices subscribed to the same calendar write the same rows rather than two copies.
 */
function toFeed(record: FeedRecord): Feed | null {
  let raw: unknown;

  try {
    raw = JSON.parse(record.settings) as unknown;
  } catch {
    return null;
  }

  const settings = feedSettingsSchema.safeParse(raw);

  if (!settings.success) {
    return null;
  }

  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastFetchedAt: record.lastFetchedAt,
    lastError: record.lastError,
    lastCount: record.lastCount,
    removedIds: record.removedIds,
    dismissedIds: record.dismissedIds,
    settings: settings.data,
  };
}

function parseRecords(rows: unknown[]): FeedRecord[] {
  return rows.flatMap((row) => {
    const parsed = feedRecordSchema.safeParse(row);

    return parsed.success ? [parsed.data] : [];
  });
}

export async function listFeeds(): Promise<Feed[]> {
  const database = await getNotesDb();
  const records = parseRecords(await database.getAll("feeds"));
  const opened = await openRows(records, "settings");

  return opened
    .map(toFeed)
    .filter((feed): feed is Feed => feed !== null)
    .sort((left, right) => left.createdAt - right.createdAt);
}

export async function getFeed(id: string): Promise<Feed | null> {
  const database = await getNotesDb();
  const [record] = parseRecords([await database.get("feeds", id)]);

  return record ? toFeed(await openRow(record, "settings")) : null;
}

/** Creates a feed, or replaces the settings of the one `id` names and keeps its history. */
export async function saveFeed(settings: FeedSettings, id?: string): Promise<Feed> {
  const database = await getNotesDb();
  const [stored] = id ? parseRecords([await database.get("feeds", id)]) : [];
  const now = Date.now();
  const record: FeedRecord = {
    id: stored?.id ?? crypto.randomUUID(),
    createdAt: stored?.createdAt ?? now,
    updatedAt: now,
    lastFetchedAt: stored?.lastFetchedAt ?? null,
    lastError: stored?.lastError ?? null,
    lastCount: stored?.lastCount ?? null,
    removedIds: stored?.removedIds ?? [],
    dismissedIds: stored?.dismissedIds ?? [],
    settings: JSON.stringify(settings),
  };

  // A feed has no key of its own: it is never shared, so the workspace's cipher seals it.
  await database.put("feeds", await sealRow(record, "settings", cipherForObject(null)));

  return { ...record, settings };
}

/** Stamps what a refresh did. The sealed settings are left exactly as they were. */
export async function recordFeedRun(id: string, run: FeedRun & Partial<FeedMemory>): Promise<void> {
  const database = await getNotesDb();
  const [stored] = parseRecords([await database.get("feeds", id)]);

  if (stored) {
    await database.put("feeds", { ...stored, ...run });
  }
}

/** Forgets a feed outright. It is local and unsynced, so there is nobody to tell. */
export async function deleteFeed(id: string): Promise<void> {
  const database = await getNotesDb();

  await database.delete("feeds", id);
}
