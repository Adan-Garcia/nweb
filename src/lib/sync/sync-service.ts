import { putKeys } from "../api/account-api";
import { getApiSession } from "../api/session-store";
import { currentKeyGraph, keysNeedUpload, markKeysUploaded } from "../keys/object-keys";
import { refreshKeyGraph } from "../keys/refresh-graph";
import { refreshSharePaths } from "../share-path-storage";
import { EMPTY_SYNC_STATE, type SyncState, syncUntilSettled } from "./run-sync";
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

let state: SyncState = EMPTY_SYNC_STATE;
let inFlight: Promise<SyncReport | null> | null = null;

/** Test seam, and what signing out uses: the next round starts from the beginning. */
export function resetSyncState(): void {
  state = EMPTY_SYNC_STATE;
  inFlight = null;
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

  // A grant re-stamps the rows it exposes, so they come back above the cursor on their own.
  // Nothing has to be re-read from the beginning.
  await refreshKeyGraph(session);

  const result = await syncUntilSettled(session, state);

  if (!result) {
    return null;
  }

  state = result.state;

  // Rows first, then the blobs they point at, so nothing arrives referencing a file that
  // is not there yet.
  const media = await syncMedia(session);

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

export type BackgroundSyncOptions = {
  everyMs?: number;
  onRound?: (report: SyncReport | null) => void;
};

export type BackgroundSync = { stop: () => void };

/**
 * Syncs on a timer, when the tab comes back to the front, and when the network returns.
 *
 * Nothing happens while the tab is hidden. A background tab that keeps polling is a battery
 * cost the user cannot see and did not ask for, and the moment it becomes visible again is
 * exactly when being up to date matters — so the visibility change is the better trigger
 * and the timer is the fallback for a tab left open in front of someone.
 */
export function startBackgroundSync({
  everyMs = 60_000,
  onRound,
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

  return {
    stop() {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    },
  };
}
