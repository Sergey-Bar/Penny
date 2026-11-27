import "server-only";

import { getDb } from "@/server/db";
import { getBackendMode, isBackendActive } from "@/server/lib/backend-mode";
import { isPipEnabled } from "@/server/lib/pip-mode";
import { israelToday } from "@/server/lib/date-utils";
import { enqueueJob } from "./queue";
import { logError, logEvent } from "@/server/lib/log";

const MINUTE_MS = 60_000;

interface ScheduleState {
  timer: ReturnType<typeof setInterval> | null;
}

declare global {
  var __pennyBackendSchedule: ScheduleState | undefined;
}

function state(): ScheduleState {
  globalThis.__pennyBackendSchedule ??= { timer: null };
  return globalThis.__pennyBackendSchedule;
}

/** Queue the recurring maintenance jobs, one idempotency key per bucket. */
function enqueueScheduledJobs(now = Date.now()): number {
  if (!isBackendActive()) return 0;
  const day = israelToday();
  const hourBucket = new Date(now).toISOString().slice(0, 13);
  const workspaces = getDb().prepare("SELECT id FROM workspaces ORDER BY id").all() as {
    id: number;
  }[];
  let enqueued = 0;
  enqueued += enqueueJob({
    type: "backup.check",
    idempotencyKey: `backup.check:${hourBucket}`,
    payload: {},
  }).created
    ? 1
    : 0;
  enqueued += enqueueJob({
    type: "maintenance.cleanup",
    idempotencyKey: `maintenance.cleanup:${day}`,
    payload: {},
  }).created
    ? 1
    : 0;
  for (const workspace of workspaces) {
    if (getBackendMode(workspace.id) === "off") continue;
    enqueued += enqueueJob({
      workspaceId: workspace.id,
      type: "integrity.check",
      idempotencyKey: `integrity.check:${workspace.id}:${day}`,
      payload: { workspaceId: workspace.id },
    }).created
      ? 1
      : 0;
    enqueued += enqueueJob({
      workspaceId: workspace.id,
      type: "intelligence.refresh",
      idempotencyKey: `intelligence.refresh:${workspace.id}:${day}`,
      payload: { workspaceId: workspace.id, asOf: day },
    }).created
      ? 1
      : 0;
    if (isPipEnabled(workspace.id)) {
      enqueued += enqueueJob({
        workspaceId: workspace.id,
        type: "pip.briefing",
        idempotencyKey: `pip.briefing:${workspace.id}:${day}`,
        payload: { workspaceId: workspace.id, asOf: day },
      }).created
        ? 1
        : 0;
    }
  }
  return enqueued;
}

/** Per-workspace one-offs enqueued when durable mode is switched on. */
export function enqueueWorkspaceEnablement(workspaceId: number): void {
  const day = israelToday();
  enqueueJob({
    workspaceId,
    type: "reclassify.workspace",
    idempotencyKey: `reclassify.workspace:${workspaceId}:enable`,
    payload: { workspaceId },
  });
  enqueueJob({
    workspaceId,
    type: "integrity.check",
    idempotencyKey: `integrity.check:${workspaceId}:${day}`,
    payload: { workspaceId },
  });
  enqueueJob({
    workspaceId,
    type: "intelligence.refresh",
    idempotencyKey: `intelligence.refresh:${workspaceId}:${day}`,
    payload: { workspaceId, asOf: day },
  });
}

export function initBackendSchedules(): void {
  const worker = state();
  if (worker.timer) return;
  const tick = () => {
    try {
      const count = enqueueScheduledJobs();
      if (count > 0) logEvent("jobs.scheduled", { enqueued: count });
    } catch (error) {
      logError("jobs/schedule", error);
    }
  };
  tick();
  worker.timer = setInterval(tick, MINUTE_MS);
  worker.timer.unref?.();
}
