import { unwrap } from "idb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "../crypto/cipher";
import { getNotesDb } from "../db/notes-db";
import { createObjectKey } from "../keys/key-graph";
import { defaultFeedSettings } from "./feed-model";
import { deleteFeed, getFeed, listFeeds, recordFeedRun, saveFeed } from "./feed-storage";

const SETTINGS = {
  ...defaultFeedSettings(),
  name: "myCourses",
  url: "https://example.edu/feed.ics",
};

beforeEach(async () => {
  await (await getNotesDb()).clear("feeds");
});

afterEach(() => {
  resetActiveCipher();
});

describe("feed storage", () => {
  it("saves a feed, lists it, and keeps its history across an edit", async () => {
    const feed = await saveFeed(SETTINGS);

    await recordFeedRun(feed.id, { lastFetchedAt: 5, lastError: null, lastCount: 12 });

    const edited = await saveFeed({ ...SETTINGS, name: "Renamed" }, feed.id);

    expect(edited).toMatchObject({ id: feed.id, createdAt: feed.createdAt, lastCount: 12 });
    expect(await listFeeds()).toEqual([edited]);
    expect(await getFeed(feed.id)).toEqual(edited);
  });

  it("lists feeds oldest first", async () => {
    const first = await saveFeed(SETTINGS);
    const second = await saveFeed({ ...SETTINGS, name: "Second" });
    const database = await getNotesDb();

    await database.put("feeds", {
      ...(await database.get("feeds", first.id))!,
      createdAt: second.createdAt + 1,
    });

    expect((await listFeeds()).map((feed) => feed.id)).toEqual([second.id, first.id]);
  });

  it("seals the address and the rules under the workspace's key", async () => {
    const key = await createObjectKey("wing");

    setActiveCipher(createAesGcmCipher(key.key, key.keyId));

    const feed = await saveFeed(SETTINGS);
    const stored = await (await getNotesDb()).get("feeds", feed.id);

    expect(stored).toMatchObject({ encryption: "aes-gcm", keyId: key.keyId });
    expect(stored?.settings).not.toContain("example.edu");
    expect((await getFeed(feed.id))?.settings.url).toBe(SETTINGS.url);
  });

  it("leaves out rows that are not feeds, or whose settings are not settings", async () => {
    const database = await getNotesDb();
    const base = {
      createdAt: 1,
      updatedAt: 1,
      lastFetchedAt: null,
      lastError: null,
      lastCount: null,
      removedIds: [],
      dismissedIds: [],
    };

    await database.put("feeds", { ...base, id: "bad-json", settings: "{" });
    await database.put("feeds", {
      ...base,
      id: "bad-shape",
      settings: JSON.stringify({ name: 1 }),
    });
    // A row some other version wrote, missing its timestamps: put through the raw store,
    // which is what lets it past the types.
    await new Promise((resolve) => {
      unwrap(database).transaction("feeds", "readwrite").objectStore("feeds").put({
        id: "not-a-feed",
        settings: "{}",
      }).onsuccess = resolve;
    });

    expect(await listFeeds()).toEqual([]);
    expect(await getFeed("bad-json")).toBeNull();
    expect(await getFeed("missing")).toBeNull();
  });

  it("records a run only on a feed that exists, and deletes one outright", async () => {
    await recordFeedRun("missing", { lastFetchedAt: 1, lastError: "unreachable", lastCount: null });

    const feed = await saveFeed(SETTINGS);

    await recordFeedRun(feed.id, { lastFetchedAt: 1, lastError: "unreachable", lastCount: null });
    expect(await getFeed(feed.id)).toMatchObject({ lastError: "unreachable" });

    await deleteFeed(feed.id);
    expect(await listFeeds()).toEqual([]);
  });
});
