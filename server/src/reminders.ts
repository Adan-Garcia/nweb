import { isPublicPushEndpoint, REMINDER_WINDOW_MS } from "@shared/sync-contract";

import type { Sql } from "./db";
import { zonedInstant } from "./zoned-time";

/**
 * The one thing this server does with the contents of a row, and the reason a due date is
 * in the clear at all.
 *
 * What it can say is "something is due". It cannot say what: the title is inside a payload
 * it has no key for. A device that is unlocked fills that in when it is opened; one that is
 * locked cannot, and the notification stays as vague as the server is. That is the cost of
 * the boundary, and it is a cost worth naming rather than working around.
 */
export type DueReminder = {
  userId: string;
  store: string;
  id: string;
  dueAt: number;
};

type DueRecord = {
  user_id: string;
  store: string;
  id: string;
  due_date: string;
  due_minutes: number | null;
  time_zone: string | null;
  reminded_at: string | number | null;
};

/**
 * Tasks whose moment has arrived and which nobody has been told about.
 *
 * A task with a date and no time is due at the start of its day, which is what someone
 * means by "Friday" with nothing after it. One whose zone the runtime does not know is
 * skipped rather than guessed at — a reminder at the wrong hour is worse than none.
 */
export async function findDueReminders(
  sql: Sql,
  now: number,
  windowMs = REMINDER_WINDOW_MS,
): Promise<DueReminder[]> {
  const { rows } = await sql.query<DueRecord>(
    `select user_id, store, id, due_date, due_minutes, time_zone, reminded_at
     from rows
     where store = 'twigs'
       and deleted_at is null
       and due_date is not null
       and status is distinct from 'complete'`,
  );

  const due: DueReminder[] = [];

  for (const record of rows) {
    const dueAt = zonedInstant(record.due_date, record.due_minutes ?? 0, record.time_zone || "UTC");

    if (dueAt === null || dueAt > now + windowMs) {
      continue;
    }

    // Already spoken about, unless the task has been moved to a later time since.
    const reminded = record.reminded_at === null ? null : Number(record.reminded_at);

    if (reminded !== null && reminded >= dueAt) {
      continue;
    }

    due.push({ userId: record.user_id, store: record.store, id: record.id, dueAt });
  }

  return due;
}

export async function markReminded(sql: Sql, reminder: DueReminder): Promise<void> {
  // The due instant rather than the clock: moving a task later makes it due again, and
  // running the sweep twice in a minute does not.
  await sql.query(
    `update rows set reminded_at = $1 where user_id = $2 and store = $3 and id = $4`,
    [reminder.dueAt, reminder.userId, reminder.store, reminder.id],
  );
}

export type StoredSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function subscriptionsFor(sql: Sql, userId: string): Promise<StoredSubscription[]> {
  const { rows } = await sql.query<{ endpoint: string; p256dh: string; auth: string }>(
    "select endpoint, p256dh, auth from push_subscriptions where user_id = $1",
    [userId],
  );

  return rows.map((row) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }));
}

export async function saveSubscription(
  sql: Sql,
  userId: string,
  subscription: StoredSubscription,
): Promise<void> {
  await sql.query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
     values ($1, $2, $3, $4)
     on conflict (user_id, endpoint) do update set
       p256dh = excluded.p256dh, auth = excluded.auth`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth],
  );
}

export async function forgetSubscription(
  sql: Sql,
  userId: string,
  endpoint: string,
): Promise<void> {
  await sql.query("delete from push_subscriptions where user_id = $1 and endpoint = $2", [
    userId,
    endpoint,
  ]);
}

/**
 * Sends one round of reminders.
 *
 * `deliver` is passed in rather than imported so the sweep can be tested without a push
 * service, and so that a dead subscription — a browser that has been uninstalled — can be
 * dropped by whoever knows what the failure meant.
 */
export async function sweepReminders(
  sql: Sql,
  deliver: (subscription: StoredSubscription, payload: string) => Promise<"sent" | "gone">,
  now = Date.now(),
): Promise<{ sent: number; dropped: number }> {
  const due = await findDueReminders(sql, now);
  const byUser = new Map<string, DueReminder[]>();

  for (const reminder of due) {
    byUser.set(reminder.userId, [...(byUser.get(reminder.userId) ?? []), reminder]);
  }

  let sent = 0;
  let dropped = 0;

  for (const [userId, reminders] of byUser) {
    const subscriptions = await subscriptionsFor(sql, userId);

    // The payload says how many and when, and nothing about what. The service worker
    // fills in the rest from what is on the device, if it can read it.
    const payload = JSON.stringify({
      count: reminders.length,
      dueAt: Math.min(...reminders.map((reminder) => reminder.dueAt)),
    });

    for (const subscription of subscriptions) {
      // Checked again here, not only when saved: a row stored before the rule existed must
      // not be the one request that still reaches into the server's own network.
      const isSafe = isPublicPushEndpoint(subscription.endpoint);

      if (!isSafe || (await deliver(subscription, payload)) === "gone") {
        await forgetSubscription(sql, userId, subscription.endpoint);
        dropped += 1;
      } else {
        sent += 1;
      }
    }

    for (const reminder of reminders) {
      await markReminded(sql, reminder);
    }
  }

  return { sent, dropped };
}
