// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Sql } from "./db";
import { type ReminderSweep, startReminderSweep } from "./runtime";

/**
 * The loop, and only the loop: that rounds happen, that they do not overlap, that one which
 * throws does not stop the next, and that stopping stops it.
 *
 * No PGlite here, and that is deliberate rather than a shortcut. The rule against mocking
 * the database exists so that no SQL passes a test Postgres would reject — and this file
 * asserts nothing about SQL. What it needs is a clock that runs, which PGlite's WASM
 * scheduling in the same worker does not leave it. `sweepReminders` and every query under
 * it are tested against real Postgres in `reminders.test.ts`; this tests the timer around
 * them, against a database that answers "nothing due" as fast as it can.
 *
 * Real timers rather than fake ones: faking the clock stalls the promises a round awaits,
 * so nothing ever completes and the loop never reschedules.
 */
const EVERY_MS = 5;

const rest = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls on the same real timers the loop uses, and says what it was waiting for. */
async function until(ready: () => boolean, label: string, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (ready()) {
      return;
    }

    await rest(EVERY_MS);
  }

  throw new Error(`Timed out waiting for ${label}.`);
}

/** Answers every query with no rows, so a round completes and finds nothing to send. */
const quiet: Sql = { query: () => Promise.resolve({ rows: [] }) };

const failing: Sql = { query: () => Promise.reject(new Error("connection reset")) };

/** One round per call, counted, and slow enough to still be running when the next is due. */
function slowSql(everyRound: () => void, ms: number): Sql {
  return {
    query: async () => {
      everyRound();
      await rest(ms);

      return { rows: [] };
    },
  };
}

let running: ReminderSweep | null = null;

afterEach(() => {
  running?.stop();
  running = null;
});

describe("the reminder sweep", () => {
  it("does not run before the first period has passed", async () => {
    const query = vi.fn(() => Promise.resolve({ rows: [] }));

    running = startReminderSweep({
      sql: { query },
      deliver: () => Promise.resolve("sent" as const),
      everyMs: 60_000,
    });
    await rest(40);

    expect(query).not.toHaveBeenCalled();
  });

  it("keeps running round after round", async () => {
    const onSwept = vi.fn();

    running = startReminderSweep({
      sql: quiet,
      deliver: () => Promise.resolve("sent" as const),
      everyMs: EVERY_MS,
      onSwept,
    });

    await until(() => onSwept.mock.calls.length > 2, "a third round");
    expect(onSwept).toHaveBeenLastCalledWith({ sent: 0, dropped: 0 });
  });

  it("does not start a round while the last one is still going", async () => {
    let started = 0;

    running = startReminderSweep({
      sql: slowSql(() => (started += 1), EVERY_MS * 20),
      deliver: () => Promise.resolve("sent" as const),
      everyMs: EVERY_MS,
    });

    // Several periods pass before the first round finishes. An interval would have started
    // one per period by now, and sent the same reminder from each of them.
    await rest(EVERY_MS * 5);

    expect(started).toBe(1);
  });

  it("keeps going after a round that threw", async () => {
    const onError = vi.fn();

    running = startReminderSweep({
      sql: failing,
      deliver: () => Promise.resolve("sent" as const),
      everyMs: EVERY_MS,
      onError,
    });

    // A database having a bad minute should cost one round of reminders, not every round
    // after it.
    await until(() => onError.mock.calls.length > 1, "a second failed round");
    expect(String(onError.mock.calls[0][0])).toContain("connection reset");
  });

  it("stops when it is told to", async () => {
    const onSwept = vi.fn();
    const sweep = startReminderSweep({
      sql: quiet,
      deliver: () => Promise.resolve("sent" as const),
      everyMs: EVERY_MS,
      onSwept,
    });

    await until(() => onSwept.mock.calls.length > 0, "a first round");
    sweep.stop();
    const roundsWhenStopped = onSwept.mock.calls.length;
    await rest(EVERY_MS * 10);

    expect(onSwept.mock.calls.length).toBe(roundsWhenStopped);
  });

  it("stops even while a round is in flight", async () => {
    let started = 0;
    const sweep = startReminderSweep({
      sql: slowSql(() => (started += 1), EVERY_MS * 4),
      deliver: () => Promise.resolve("sent" as const),
      everyMs: EVERY_MS,
    });

    await until(() => started === 1, "the first round to begin");
    sweep.stop();
    await rest(EVERY_MS * 10);

    // The round that was already running finished; none was scheduled behind it.
    expect(started).toBe(1);
  });

  it("can be stopped twice without complaining", () => {
    const sweep = startReminderSweep({
      sql: quiet,
      deliver: () => Promise.resolve("sent" as const),
      everyMs: 1_000,
    });

    sweep.stop();

    expect(() => sweep.stop()).not.toThrow();
  });
});
