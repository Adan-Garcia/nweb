import { beforeEach, describe, expect, it } from "vitest";

import { sharedToRead } from "@/test/read-only";

import { getNotesDb } from "../db/notes-db";
import {
  createTwigSeries,
  dayShiftBetween,
  repeatTwig,
  SERIES_MAX_OCCURRENCES,
  seriesDates,
  softDeleteTwigSeries,
  updateTwigSeries,
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

describe("softDeleteTwigSeries from a date", () => {
  it("removes the occurrences due on or after it, and keeps the earlier ones", async () => {
    const [first] = await createTwigSeries(
      { branchId: "b", title: "A", dueDate: "2026-09-28" },
      "daily",
      "2026-10-01",
    );

    expect(await softDeleteTwigSeries(first.seriesId ?? "", "2026-09-30")).toBe(2);
    expect((await listTwigs()).map((twig) => twig.dueDate).sort()).toEqual([
      "2026-09-28",
      "2026-09-29",
    ]);
  });
});

describe("updateTwigSeries", () => {
  it("changes every occurrence and moves each by the same days", async () => {
    const [first] = await createTwigSeries(
      { branchId: "b", title: "Quiz", dueDate: "2026-09-28", dueTime: "9:00 AM" },
      "weekly",
      "2026-10-12",
    );

    const count = await updateTwigSeries(
      first.seriesId ?? "",
      null,
      { title: "Quiz!", dueTime: "2:00 PM", branchId: "c", kind: "exam" },
      2,
    );

    const twigs = await listTwigs();

    expect(count).toBe(3);
    expect(twigs.map((twig) => twig.dueDate).sort()).toEqual([
      "2026-09-30",
      "2026-10-07",
      "2026-10-14",
    ]);
    expect(twigs.every((twig) => twig.title === "Quiz!" && twig.dueMinutes === 14 * 60)).toBe(true);
  });

  it("reaches only the occurrences from a date on, and leaves a dateless one dateless", async () => {
    const [first, second] = await createTwigSeries(
      { branchId: "b", title: "Lab", dueDate: "2026-09-28" },
      "weekly",
      "2026-10-05",
    );
    const dateless = await createTwig({ branchId: "b", title: "Lab", seriesId: first.seriesId });

    await updateTwigSeries(
      first.seriesId ?? "",
      second.dueDate,
      { title: "Lab 2", dueTime: "", branchId: "b", kind: "other" },
      1,
    );
    expect((await listTwigs()).map((twig) => `${twig.title} ${twig.dueDate}`).sort()).toEqual([
      "Lab 2 2026-10-06",
      "Lab 2026-09-28",
      "Lab null",
    ]);

    await updateTwigSeries(
      first.seriesId ?? "",
      null,
      { title: "All", dueTime: "", branchId: "b", kind: "other" },
      1,
    );
    expect((await listTwigs()).find((twig) => twig.id === dateless.id)?.dueDate).toBeNull();
  });
});

describe("repeatTwig", () => {
  it("turns a task into the first of a series, keeping its id and status", async () => {
    const twig = await createTwig({
      branchId: "b",
      title: "Reading",
      dueDate: "2026-09-28",
      dueTime: "8:00 AM",
      status: "inprogress",
    });

    const created = await repeatTwig(twig, "daily", "2026-09-30");
    const twigs = await listTwigs();

    expect(created.map((row) => row.dueDate)).toEqual(["2026-09-29", "2026-09-30"]);
    expect(created[0]).toMatchObject({
      title: "Reading",
      dueTime: "8:00 AM",
      status: "incomplete",
    });
    expect(twigs.find((row) => row.id === twig.id)).toMatchObject({ status: "inprogress" });
    expect(new Set(twigs.map((row) => row.seriesId)).size).toBe(1);
    expect(twigs[0].seriesId).not.toBeNull();
  });

  it("keeps the task's own date when the rule would skip it", async () => {
    // A Saturday, repeating every weekday: the Saturday stays, the weekdays follow.
    const twig = await createTwig({ branchId: "b", title: "Study", dueDate: "2026-10-03" });

    const created = await repeatTwig(twig, "weekdays", "2026-10-06");

    expect(created.map((row) => row.dueDate)).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("does nothing for no repeat, a task with no date, or one it may not change", async () => {
    const dated = await createTwig({ branchId: "b", title: "A", dueDate: "2026-09-28" });
    const dateless = await createTwig({ branchId: "b", title: "B" });

    expect(await repeatTwig(dated, "none", "")).toEqual([]);
    expect(await repeatTwig(dateless, "daily", "2026-10-01")).toEqual([]);

    const database = await getNotesDb();
    await database.put("twigs", { ...(await database.get("twigs", dated.id))!, keyId: "theirs" });
    const undo = sharedToRead("theirs");

    try {
      expect(await repeatTwig(dated, "daily", "2026-10-01")).toEqual([]);
    } finally {
      undo();
    }
    expect(await listTwigs()).toHaveLength(2);
  });
});

describe("dayShiftBetween", () => {
  it("counts the days between two dates, and none when either is missing", () => {
    expect(dayShiftBetween("2026-09-28", "2026-10-02")).toBe(4);
    expect(dayShiftBetween("2026-10-02", "2026-09-28")).toBe(-4);
    expect(dayShiftBetween(null, "2026-09-28")).toBe(0);
    expect(dayShiftBetween("2026-09-28", null)).toBe(0);
  });
});
