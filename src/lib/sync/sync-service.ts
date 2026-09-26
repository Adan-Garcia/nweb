import type { KeyGraph } from "@shared/sharing-contract";

import { putKeys } from "../api/account-api";
import { getApiSession } from "../api/session-store";
import {
  currentKeyGraph,
  keysNeedUpload,
  markKeysUploaded,
  servedKeyGraph,
} from "../keys/object-keys";
import { refreshKeyGraph } from "../keys/refresh-graph";
import { rotateAgedKeys } from "../keys/rotate-shared";
import { refreshSharePaths } from "../share-path-storage";
import { type LiveChannelOptions, openLiveChannel } from "./live-channel";
import {
  backfillGrants,
  type ChangedRow,
  EMPTY_SYNC_STATE,
  type SyncState,
  syncUntilSettled,
} from "./run-sync";
import { syncMedia } from "./sync-media";

/**
 * One sync cursor for the whole app, and the loop that turns it.
 *
 * The cursor cannot live in a component: a "Sync now" button and a background loop that
 * both kept their own would each re-fetch what the other had already taken, and the server
 * would hand the same page over twice. There is one device, so there is one cursor.
 *
 * A round is also not allowed to overlap itself, for the reason the server's reminder sweep
 * is a chained timeout rather than an interval: two rounds in flight would push the same
 * rows twice and race on which cursor wins.
 */
export type SyncReport = { pushed: number; applied: number; media: number; at: number };

export type SyncListener = (changed: ChangedRow[]) => void;

let state: SyncState = EMPTY_SYNC_STATE;
let inFlight: Promise<SyncReport | null> | null = null;
let nudgedDuringRound = false;
const listeners = new Set<SyncListener>();

/** Test seam, and what signing out uses: the next round starts from the beginning. */
export function resetSyncState(): void {
  state = EMPTY_SYNC_STATE;
  inFlight = null;
  nudgedDuringRound = false;
}

function grantIds(graphs: (KeyGraph | null)[]): Set<string> {
  return new Set(graphs.flatMap((graph) => graph?.grants ?? []).map((grant) => grant.keyId));
}

/**
 * Sends whatever keys this device has minted since the last round.
 *
 * The whole graph goes rather than a delta: keys and wraps are written with `on conflict`,
 * so re-sending one is a no-op, and a delta would need a second cursor to be wrong about.
 * Grants are left out — they are the server's to hand out, and a client re-asserting one
 * would be claiming access rather than recording a key.
 */
async function pushKeys(): Promise<void> {
  const session = getApiSession();
  const graph = currentKeyGraph();

  if (!session?.token || !graph || !keysNeedUpload()) {
    return;
  }

  const sent = await putKeys(session, { keys: graph.keys, wraps: graph.wraps, grants: [] });

  if (sent.ok) {
    markKeysUploaded();
  }
}

async function round(): Promise<SyncReport | null> {
  const session = getApiSession();

  if (!session?.token) {
    return null;
  }

  // Keys both ways before any row moves. Ours first, because a row whose key the server has
  // never heard of is one no second device can open; then theirs, because a course shared
  // with us since the last round arrives as rows we would otherwise pull, fail to open, and
  // step past for good.
  await pushKeys();

  // A course renamed since it was shared is re-described before the rows go, so the new
  // name travels in the same round as everything else.
  await refreshSharePaths();

  // Grants this device has not seen before are the shares made since it last looked. Their
  // rows are older than the cursor, so they are asked for by key rather than by `seq`.
  const known = grantIds([currentKeyGraph(), servedKeyGraph()]);

  await refreshKeyGraph(session);

  const fresh = [...grantIds([servedKeyGraph()])].filter((keyId) => !known.has(keyId));

  // Before the rows go, so what a rotation moves travels in this same round.
  await rotateAgedKeys(session);

  const backfilled = fresh.length ? await backfillGrants(session, fresh) : [];
  const result = await syncUntilSettled(session, state);

  if (!result) {
    return null;
  }

  state = result.state;

  // Rows first, then the blobs they point at, so nothing arrives referencing a file that
  // is not there yet — and only then is anybody told, so a note refreshed on the strength
  // of it finds its pictures.
  const media = await syncMedia(session);
  const changed = [...(backfilled ?? []), ...result.outcome.changed];

  if (changed.length) {
    for (const listener of listeners) {
      listener(changed);
    }
  }

  return {
    pushed: result.outcome.pushed,
    applied: result.outcome.applied,
    media: (media?.uploaded ?? 0) + (media?.downloaded ?? 0),
    at: Date.now(),
  };
}

/**
 * Runs a round, or joins the one already running.
 *
 * Joining rather than queueing is deliberate: the caller wants "everything is up to date",
 * and a round that is already in flight will deliver exactly that.
 */
export function runSyncRound(): Promise<SyncReport | null> {
  inFlight ??= round().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/**
 * Runs a round because something changed elsewhere, and runs one more if it arrived while a
 * round was already going: that round may have pulled before the change was written, and
 * joining it would report "up to date" without it.
 */
async function roundForNudge(onRound?: (report: SyncReport | null) => void): Promise<void> {
  if (inFlight) {
    nudgedDuringRound = true;
    return;
  }

  do {
    nudgedDuringRound = false;

    const report = await runSyncRound();

    onRound?.(report);
  } while (nudgedDuringRound);
}

/**
 * Hears which rows a round changed on this device. An open note uses it to show another
 * person's edit without being reopened. Returns the function that stops listening.
 */
export function subscribeToSyncChanges(listener: SyncListener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export type BackgroundSyncOptions = {
  everyMs?: number;
  onRound?: (report: SyncReport | null) => void;
  /**
   * How to open the live channel's socket, or false for none. Defaults to the browser's own
   * WebSocket; a test passes a fake, or turns it off.
   */
  liveSocket?: LiveChannelOptions["createSocket"] | false;
};

export type BackgroundSync = { stop: () => void };

/**
 * Syncs on a timer, when the tab comes back to the front, when the network returns, and the
 * moment the server says something this account can read has changed.
 *
 * Nothing happens while the tab is hidden. A background tab that keeps polling is a battery
 * cost the user cannot see and did not ask for, and the moment it becomes visible again is
 * exactly when being up to date matters — so the visibility change is the better trigger
 * and the timer is the fallback for a tab left open in front of someone.
 */
export function startBackgroundSync({
  everyMs = 60_000,
  onRound,
  liveSocket,
}: BackgroundSyncOptions = {}): BackgroundSync {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  // No `typeof document` guard: this is started from the app shell, in a browser. A check
  // for an environment that cannot reach here would be a branch nothing could ever cover.
  const isVisible = () => document.visibilityState !== "hidden";

  const tick = async () => {
    if (!stopped && isVisible()) {
      // The round runs first and is reported second. Written as `onRound?.(await round())`
      // it would not run at all without a listener: an optional call does not evaluate its
      // arguments, so a sync with nobody watching would quietly never happen.
      const report = await runSyncRound();

      onRound?.(report);
    }

    if (!stopped) {
      timer = setTimeout(() => void tick(), everyMs);
    }
  };

  const onWake = () => {
    if (isVisible()) {
      void tick();
    }
  };

  timer = setTimeout(() => void tick(), everyMs);
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("online", onWake);

  // A nudge while hidden is dropped rather than queued: coming back to the front runs a
  // round anyway, which covers it.
  const live =
    liveSocket === false
      ? null
      : openLiveChannel({
          session: getApiSession,
          onNudge: () => {
            if (!stopped && isVisible()) {
              void roundForNudge(onRound);
            }
          },
          ...(liveSocket ? { createSocket: liveSocket } : {}),
        });

  return {
    stop() {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      live?.stop();
    },
  };
}
