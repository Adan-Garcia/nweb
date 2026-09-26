import type { Sql } from "./db";
import { type StoredSubscription, sweepReminders } from "./reminders";

/**
 * The part of running this server that is not a request: a loop that looks for what is due
 * and sends it.
 *
 * It is a chained timeout rather than an interval, so a sweep that takes longer than the
 * period cannot overlap itself and send the same reminder twice from two runs. A sweep that
 * throws is reported and the loop continues: a database blip should cost one round of
 * reminders, not every round after it.
 */
export type Deliver = (
  subscription: StoredSubscription,
  payload: string,
) => Promise<"sent" | "gone">;

export type SweepOptions = {
  sql: Sql;
  deliver: Deliver;
  everyMs: number;
  onSwept?: (result: { sent: number; dropped: number }) => void;
  onError?: (error: unknown) => void;
};

export type ReminderSweep = { stop: () => void };

export function startReminderSweep({
  sql,
  deliver,
  everyMs,
  onSwept,
  onError,
}: SweepOptions): ReminderSweep {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const tick = async () => {
    try {
      // The sweep runs first and is reported second. Written as `onSwept?.(await sweep())`
      // it would not run at all without a listener: an optional call does not evaluate its
      // arguments, so the whole round would short-circuit on a missing callback.
      const swept = await sweepReminders(sql, deliver);

      onSwept?.(swept);
    } catch (error) {
      onError?.(error);
    }

    if (!stopped) {
      timer = setTimeout(() => void tick(), everyMs);
    }
  };

  timer = setTimeout(() => void tick(), everyMs);

  return {
    stop() {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
