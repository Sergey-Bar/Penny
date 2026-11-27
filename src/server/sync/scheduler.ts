import "server-only";

import { syncWorkspace, type WorkspaceSummary } from "@/server/sync/orchestrator";
import { SyncBusyError, tryAcquireSync } from "@/server/sync/lock";
import { getGlobalSetting, setGlobalSetting } from "@/server/db/queries/settings";
import { failInterruptedSyncRuns, latestSyncStartMs } from "@/server/db/queries/sync-runs";
import { listBankCredentials } from "@/server/db/queries/bank-credentials";
import { redactError } from "@/server/lib/redact";
import { isKeyLocked } from "@/server/lib/encryption";
import { isDemoMode } from "@/server/demo/mode";
import { getBackendMode } from "@/server/lib/backend-mode";
import { enqueueJob } from "@/server/jobs/queue";
import { listAllWorkspaceIds } from "@/server/lib/workspace-context";
import { israelToday } from "@/server/lib/date-utils";
import { dueRun, msUntilNextSlot, type ScheduleState } from "@/lib/sync-schedule";

interface SchedulerState {
  intervalId: ReturnType<typeof setInterval> | null;
  running: boolean;
  initialized: boolean;
  exitHandlerRegistered: boolean;
}

declare global {
  var __pennyScheduler: SchedulerState | undefined;
}

function getState(): SchedulerState {
  if (!globalThis.__pennyScheduler) {
    globalThis.__pennyScheduler = {
      intervalId: null,
      running: false,
      initialized: false,
      exitHandlerRegistered: false,
    };
  }
  return globalThis.__pennyScheduler;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/**
 * The clock is checked every minute instead of arming one timer for tomorrow: a long timer does not
 * fire on time after the computer sleeps, and never fires for a slot missed while it was off.
 */
const TICK_MS = 60_000;

const LAST_ATTEMPT = "auto_sync_last_attempt";
const RETRY_IDS = "auto_sync_retry_ids";
const RETRIES = "auto_sync_retries";

function readSettings(): { enabled: boolean; time: string } {
  // On unless the user turned it off: a daily sync at 06:00 keeps the data fresh without a button.
  const enabled = getGlobalSetting("auto_sync_enabled") !== "false";
  const time = getGlobalSetting("auto_sync_time");
  const safeTime = time && TIME_RE.test(time) ? time : "06:00";
  return { enabled, time: safeTime };
}

function readSchedule(): ScheduleState {
  const last = Number(getGlobalSetting(LAST_ATTEMPT));
  // Jobs own retries now; there is no scheduler retry pass.
  return {
    lastAttemptMs: Number.isFinite(last) && last > 0 ? last : null,
    retryPending: false,
    retries: 0,
  };
}

/** Kept for callers/tests that classify provider failures; the scheduler no longer stores retry ids. */
export function retryableFailures(summaries: WorkspaceSummary[]): number[] {
  return summaries.flatMap((w) =>
    w.providers.filter((p) => !p.ok && p.retryable).map((p) => p.credentialId),
  );
}

async function tick(): Promise<void> {
  const state = getState();
  if (state.running) return;
  // The demo household's bank logins are made up: a sync there can only fail and paint every connection as broken.
  if (isDemoMode()) return;
  const { enabled, time } = readSettings();
  if (!enabled) return;
  // After a restart with the app lock on, bank passwords stay wrapped until someone unlocks once.
  // Nothing is recorded, so the run happens on the first tick after the unlock.
  if (isKeyLocked()) return;
  // First tick after an upgrade from the timer-based scheduler: count the last sync as the last
  // attempt, so the next run is at the usual time and not a surprise login a minute after start.
  if (getGlobalSetting(LAST_ATTEMPT) == null)
    setGlobalSetting(LAST_ATTEMPT, String(latestSyncStartMs() ?? Date.now()));
  const due = dueRun(time, readSchedule());
  if (!due) return;

  state.running = true;
  const startedAt = Date.now();
  console.log(`[scheduler] running (${due})`);
  try {
    const workspaceIds = listAllWorkspaceIds();
    const inlineWorkspaces: number[] = [];
    let enqueued = 0;

    for (const workspaceId of workspaceIds) {
      const mode = getBackendMode(workspaceId);
      if (mode === "on") {
        // Durable mode: one job per credential; the jobs own their retries and post-processing.
        for (const credential of listBankCredentials(workspaceId)) {
          enqueueJob({
            workspaceId,
            type: "sync.run",
            payload: { workspaceId, credentialId: credential.id },
            idempotencyKey: `sync.run:${credential.id}:${israelToday()}`,
          });
          enqueued++;
        }
      } else {
        inlineWorkspaces.push(workspaceId);
      }
    }

    if (inlineWorkspaces.length > 0) {
      const release = tryAcquireSync("scheduled");
      if (!release) throw new SyncBusyError();
      try {
        for (const workspaceId of inlineWorkspaces) {
          const mode = getBackendMode(workspaceId);
          await syncWorkspace(workspaceId, undefined, () => {}, false, {
            mode: mode === "shadow" ? "shadow" : "inline",
          });
        }
      } finally {
        release();
      }
    }

    setGlobalSetting(LAST_ATTEMPT, String(startedAt));
    setGlobalSetting(RETRY_IDS, "[]");
    setGlobalSetting(RETRIES, "0");
    if (enqueued > 0) console.log(`[scheduler] enqueued ${enqueued} sync job(s)`);
    console.log("[scheduler] done");
  } catch (err) {
    // A manual sync is running: nothing is recorded, so the next tick tries again.
    if (err instanceof SyncBusyError)
      console.warn("[scheduler] waiting: a sync is already running");
    else {
      console.error("[scheduler] run failed:", redactError(err));
      // Recorded as an attempt, or a failure that repeats would retry every minute.
      setGlobalSetting(LAST_ATTEMPT, String(startedAt));
      setGlobalSetting(RETRY_IDS, "[]");
      setGlobalSetting(RETRIES, "0");
    }
  } finally {
    state.running = false;
  }
}

function start(): void {
  const state = getState();
  if (state.intervalId) return;
  state.intervalId = setInterval(() => void tick(), TICK_MS);
  // The check must not keep a finished process (a script, a test) alive.
  state.intervalId.unref();
}

function cancel(): void {
  const state = getState();
  if (state.intervalId) clearInterval(state.intervalId);
  state.intervalId = null;
}

/** Settings are read on every tick, so a changed time or switch needs no re-arming; kept for its callers. */
export function reschedule(): void {
  start();
}

export function initScheduler(): void {
  const state = getState();
  if (!state.initialized) {
    state.initialized = true;
    // Nothing can be mid-sync when the process has just started: a run still marked as running was cut off by a crash or a shutdown.
    try {
      const interrupted = failInterruptedSyncRuns();
      if (interrupted) console.warn(`[scheduler] closed ${interrupted} interrupted sync run(s)`);
    } catch (err) {
      console.error("[scheduler] could not close interrupted runs:", redactError(err));
    }
    registerExitHandlers();
  }
  start();
}

export function getNextRunAt(): string | null {
  const { enabled, time } = readSettings();
  return enabled ? new Date(Date.now() + msUntilNextSlot(time)).toISOString() : null;
}

function registerExitHandlers(): void {
  const state = getState();
  if (state.exitHandlerRegistered) return;
  state.exitHandlerRegistered = true;
  const stop = () => cancel();
  process.on("exit", stop);
  process.on("SIGINT", () => {
    stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit(0);
  });
}

/** For tests: one pass of the clock check. */
export const runSchedulerTick = tick;
