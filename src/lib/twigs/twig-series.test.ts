import { beforeEach, describe, expect, it } from "vitest";

import { sharedToRead } from "@/test/read-only";

import { getNotesDb } from "../db/notes-db";
import {
  createTwigSeries,
  SERIES_MAX_OCCURRENCES,
  seriesDates,
  softDeleteTwigSeries,
} from "./twig-series";
import { createTwig, listTwigs } from "./twig-storage";

beforeEach(async () => {
  await (await getNotesDb()).clear("twigs");
});

describe("seriesDates", () => {
  it("is the one date for a task that does not repeat", () => {
    expect(seriesDates("2026-09-28", "none", "2027-01-01")).toEqual(["2026-09-28"]);
  });

  it("steps each cadence through its last date, inclusive", () => {
    expect(seriesDates("2026-09-28", "daily", "2026-09-30")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
    ]);
    expect(seriesDates("2026-09-28", "weekly", "2026-10-12")).toEqual([
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
    ]);
    expect(seriesDates("2026-09-28", "biweekly", "2026-10-26")).toEqual([
      "2026-09-28",
      "2026-10-12",
      "2026-10-26",
    ]);
    expect(seriesDates("2026-01-31", "monthly", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-03-31",
    ]);
  });

  it("skips weekends on weekdays, the first date included", () => {
    expect(seriesDates("2026-10-02", "weekdays", "2026-10-06")).toEqual([
      "2026-10-02",
      "2026-10-05",
      "2026-10-06",
    ]);
    expect(seriesDates("2026-10-03", "weekdays", "2026-10-06")).toEqual([
      "2026-10-05",
      "2026-10-06",
    ]);
  });

  it("stops at its caps, however far away the last date is", () => {
    expect(seriesDates("2026-01-01", "daily", "2099-01-01")).toHaveLength(SERIES_MAX_OCCURRENCES);
    expect(seriesDates("2026-01-01", "monthly", "2099-01-01").at(-1)).toBe("2027-02-01");
  });
});

describe("createTwigSeries", () => {
  it("writes one task per date, all sharing a series", async () => {
    const created = await createTwigSeries(
      { branchId: "b", title: "Reading", dueDate: "2026-09-28", dueTime: "9:00 AM" },
      "daily",
      "2026-09-30",
    );

    expect(created.map((twig) => twig.dueDate)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
    expect(new Set(created.map((twig) => twig.seriesId)).size).toBe(1);
    expect(created[0]).toMatchObject({ title: "Reading", dueTime: "9:00 AM" });
    expect(created[0].seriesId).toEqual(expect.any(String));
  });

  it("writes a single task with no series when it does not repeat", async () => {
    const [twig] = await createTwigSeries(
      { branchId: "b", title: "Once", dueDate: "2026-09-28" },
      "none",
      "",
    );

    expect(twig.seriesId).toBeNull();
  });
});

describe("softDeleteTwigSeries", () => {
  it("removes every task of one series, and nothing else", async () => {
    const [first] = await createTwigSeries(
      { branchId: "b", title: "A", dueDate: "2026-09-28" },
      "daily",
      "2026-09-29",
    );
    await createTwigSeries(
      { branchId: "b", title: "B", dueDate: "2026-09-28" },
      "daily",
      "2026-09-29",
    );
    await createTwig({ branchId: "b", title: "Alone" });

    expect(await softDeleteTwigSeries(first.seriesId ?? "")).toBe(2);
    expect((await listTwigs()).map((twig) => twig.title).sort()).toEqual(["Alone", "B", "B"]);
    expect(await softDeleteTwigSeries(first.seriesId ?? "")).toBe(0);
  });

  it("leaves an occurrence this device was given only to read", async () => {
    const [first] = await createTwigSeries(
      { branchId: "b", title: "A", dueDate: "2026-09-28" },
      "daily",
      "2026-09-29",
    );
    const database = await getNotesDb();

    await database.put("twigs", {
      ...(await database.get("twigs", first.id))!,
      keyId: "their-key",
    });
    const undo = sharedToRead("their-key");

    try {
      expect(await softDeleteTwigSeries(first.seriesId ?? "")).toBe(1);
    } finally {
      undo();
    }
  });
});
