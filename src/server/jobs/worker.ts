import "server-only";

import { randomUUID } from "node:crypto";
import { logEvent, logError } from "@/server/lib/log";
import { redactError } from "@/server/lib/redact";
import { isBackendActive } from "@/server/lib/backend-mode";
import { recordJobMetric } from "@/server/observability/metrics";
import { getDb } from "@/server/db";
import {
  claimNextJob,
  claimSpecificJob,
  completeJob,
  failJob,
  getJob,
  heartbeatJob,
  reconcileOrphanAttempts,
  releaseJobLease,
  requeueExpiredLeases,
  saveJobState,
} from "./queue";
import { acquireLock, heartbeatLock, releaseLock } from "./locks";
import { getJobHandler } from "./registry";
import type { JobLane, JobRow } from "./types";

const BOOT_ID = `${process.pid}:${randomUUID()}`;
const LANES: JobLane[] = ["critical", "maintenance"];
const LEASE_SECONDS = 150;
const HEARTBEAT_MS = 30_000;
const PUMP_INTERVAL_MS = 1_000;

interface LaneState {
  running: boolean;
}

interface WorkerState {
  initialized: boolean;
  active: boolean;
  lanes: Record<JobLane, LaneState>;
  pumpTimer: ReturnType<typeof setInterval> | null;
  lockTimer: ReturnType<typeof setInterval> | null;
  standbyTimer: ReturnType<typeof setInterval> | null;
  activeJobs: Map<number, string>;
  exitRegistered: boolean;
}

declare global {
  var __pennyJobWorker: WorkerState | undefined;
}

function state(): WorkerState {
  if (!globalThis.__pennyJobWorker) {
    globalThis.__pennyJobWorker = {
      initialized: false,
      active: false,
      lanes: { critical: { running: false }, maintenance: { running: false } },
      pumpTimer: null,
      lockTimer: null,
      standbyTimer: null,
      activeJobs: new Map(),
      exitRegistered: false,
    };
  }
  return globalThis.__pennyJobWorker;
}

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const DEFAULT_RETRY_MS = [15_000, 60_000, 300_000];

async function runJob(
  job: JobRow,
  owner: string,
  emit: (event: string, data: Record<string, unknown>) => void = () => {},
): Promise<void> {
  const handler = getJobHandler(job.type);
  if (!handler) {
    failJob({
      id: job.id,
      owner,
      errorCode: "unknown_type",
      error: `No handler registered for ${job.type}`,
      retryDelaysMs: [],
      maxAttempts: job.max_attempts,
    });
    return;
  }

  const payload = parseJson(job.payload_json);
  if (handler.payloadSchema) {
    const parsed = handler.payloadSchema.safeParse(payload);
    if (!parsed.success) {
      failJob({
        id: job.id,
        owner,
        errorCode: "bad_payload",
        error: parsed.error.message,
        retryDelaysMs: [],
        maxAttempts: 0,
      });
      logEvent("job.dead", { jobId: job.id, type: job.type, code: "bad_payload" });
      return;
    }
  }

  const mutableState = parseJson(job.state_json);
  const controller = new AbortController();
  const startedAt = Date.now();
  state().activeJobs.set(job.id, owner);
  const heartbeat = setInterval(() => {
    try {
      if (!heartbeatJob(job.id, owner, LEASE_SECONDS))
        console.warn(`[jobs] lease lost for job ${job.id}`);
    } catch (error) {
      logError("jobs/heartbeat", error, { jobId: job.id });
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  try {
    await handler.run({
      job,
      payload,
      state: mutableState,
      shadow: job.shadow === 1,
      signal: controller.signal,
      saveState: (patch) => {
        Object.assign(mutableState, patch);
        saveJobState(job.id, mutableState);
      },
      emit,
    });
    completeJob(job.id, owner);
    recordJobMetric(job.type, "succeeded", Date.now() - startedAt);
    logEvent("job.succeeded", {
      jobId: job.id,
      type: job.type,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    const errorCode = typeof code === "string" ? code : "exception";
    const noRetry = Boolean((error as { noRetry?: unknown } | null)?.noRetry);
    const result = failJob({
      id: job.id,
      owner,
      errorCode,
      error: redactError(error),
      retryDelaysMs: handler.retryDelaysMs ?? DEFAULT_RETRY_MS,
      maxAttempts: noRetry ? 0 : job.max_attempts,
    });
    recordJobMetric(job.type, result, Date.now() - startedAt);
    logEvent("job.failed", {
      jobId: job.id,
      type: job.type,
      code: errorCode,
      status: result,
      durationMs: Date.now() - startedAt,
    });
    if (result === "dead") {
      try {
        getDb()
          .prepare(
            `INSERT INTO audit_log
               (workspace_id, actor, action, entity_type, entity_id, before_json)
             VALUES (?, 'worker', 'job.dead', 'jobs', ?, ?)`,
          )
          .run(
            job.workspace_id,
            String(job.id),
            JSON.stringify({ type: job.type, code: errorCode }),
          );
      } catch (auditError) {
        logError("jobs/audit", auditError, { jobId: job.id });
      }
    }
  } finally {
    clearInterval(heartbeat);
    state().activeJobs.delete(job.id);
  }
}

async function pump(lane: JobLane): Promise<void> {
  const worker = state();
  if (worker.lanes[lane].running) return;
  worker.lanes[lane].running = true;
  try {
    // Each lane runs one job at a time; the two lanes are independent.
    while (worker.active && isBackendActive()) {
      const job = claimNextJob(lane, BOOT_ID, LEASE_SECONDS);
      if (!job) break;
      await runJob(job, BOOT_ID);
    }
  } catch (error) {
    logError(`jobs/${lane}`, error);
  } finally {
    worker.lanes[lane].running = false;
  }
}

function startPumps(): void {
  const worker = state();
  if (worker.pumpTimer) return;
  worker.pumpTimer = setInterval(() => {
    for (const lane of LANES) void pump(lane);
  }, PUMP_INTERVAL_MS);
  worker.pumpTimer.unref?.();
  for (const lane of LANES) void pump(lane);
}

function stopPumps(): void {
  const worker = state();
  if (worker.pumpTimer) clearInterval(worker.pumpTimer);
  worker.pumpTimer = null;
}

function releaseActiveJobs(): void {
  for (const [jobId, owner] of state().activeJobs) {
    try {
      releaseJobLease(jobId, owner);
    } catch {
      // The process is exiting; an expired lease will be requeued on the next start.
    }
  }
  try {
    releaseLock("worker", BOOT_ID);
  } catch {
    // Same as above.
  }
}

function becomeStandby(): void {
  const worker = state();
  if (worker.standbyTimer) return;
  worker.active = false;
  stopPumps();
  if (worker.lockTimer) clearInterval(worker.lockTimer);
  worker.lockTimer = null;
  worker.standbyTimer = setInterval(() => {
    if (!isBackendActive()) return;
    if (acquireLock("worker", BOOT_ID, 60, { pid: process.pid })) {
      worker.active = true;
      if (worker.standbyTimer) clearInterval(worker.standbyTimer);
      worker.standbyTimer = null;
      startWorkerLoops();
    }
  }, 5_000);
  worker.standbyTimer.unref?.();
}

function startWorkerLoops(): void {
  const worker = state();
  worker.active = true;
  worker.lockTimer = setInterval(() => {
    try {
      if (!heartbeatLock("worker", BOOT_ID, 60)) {
        console.warn("[jobs] worker lock lost; standing by");
        becomeStandby();
      }
    } catch (error) {
      logError("jobs/worker-lock", error);
    }
  }, 20_000);
  worker.lockTimer.unref?.();
  startPumps();
}

/**
 * Starts the two-lane worker. One process holds `runtime_locks.worker`; any other becomes
 * standby and takes over only after the lease expires.
 */
export function initJobWorker(): void {
  const worker = state();
  if (worker.initialized) {
    if (worker.active) {
      startPumps();
      return;
    }
    // The app started with backend_v2 off and a workspace was just enabled.
    if (isBackendActive()) {
      if (acquireLock("worker", BOOT_ID, 60, { pid: process.pid })) startWorkerLoops();
      else becomeStandby();
    }
    return;
  }
  worker.initialized = true;
  try {
    const requeued = requeueExpiredLeases();
    const attempts = reconcileOrphanAttempts();
    if (requeued || attempts) logEvent("jobs.recovered", { requeued, orphanAttempts: attempts });
  } catch (error) {
    logError("jobs/recover", error);
  }

  if (!worker.exitRegistered) {
    worker.exitRegistered = true;
    process.on("exit", releaseActiveJobs);
  }

  if (!isBackendActive()) {
    // Off: the worker stays idle until a workspace is enabled.
    worker.active = false;
    return;
  }

  if (acquireLock("worker", BOOT_ID, 60, { pid: process.pid })) {
    startWorkerLoops();
  } else {
    becomeStandby();
  }
}

/**
 * Executes a job this process already leased (manual SSE post-processing). The caller owns the
 * lease and its heartbeat; step events are forwarded through `emit`.
 */
export async function executeLeasedJob(
  jobId: number,
  owner: string,
  emit?: (event: string, data: Record<string, unknown>) => void,
): Promise<JobRow | null> {
  const before = getJob(jobId);
  if (!before) return null;
  const job = claimSpecificJob(jobId, owner, 300);
  if (!job) {
    // The worker may already be running this job. Wait for it rather than running a second pass.
    for (let i = 0; i < 600; i++) {
      const current = getJob(jobId);
      if (!current) return null;
      if (
        current.status === "succeeded" ||
        current.status === "dead" ||
        current.status === "cancelled"
      )
        return current;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return getJob(jobId);
  }
  await runJob(job, owner, emit);
  return getJob(jobId);
}

export function workerStatus(): {
  mode: "active" | "standby" | "off";
  lanes: Record<JobLane, boolean>;
  activeJobs: number;
} {
  const worker = state();
  return {
    mode:
      !worker.initialized || !worker.active ? (isBackendActive() ? "standby" : "off") : "active",
    lanes: {
      critical: worker.lanes.critical.running,
      maintenance: worker.lanes.maintenance.running,
    },
    activeJobs: worker.activeJobs.size,
  };
}

/** Test hook: process one lane once without requiring the worker to have been initialized. */
export async function runLaneOnce(lane: JobLane): Promise<void> {
  const worker = state();
  const previous = worker.active;
  worker.active = true;
  try {
    await pump(lane);
  } finally {
    worker.active = previous;
  }
}
