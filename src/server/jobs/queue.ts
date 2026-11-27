import "server-only";

import { getDb } from "@/server/db";
import type { JobLane, JobRow, JobStatus, EnqueueJobInput } from "./types";
import { sqlTime, sqlTimeAfter } from "./locks";

/** Default lane and priority per plan: a post-process runs before the next credential's sync. */
const DEFAULT_LANE: Record<string, JobLane> = {
  "repair.data": "critical",
  "sync.post_process": "critical",
  "sync.run": "critical",
  "integrity.check": "critical",
  "backup.check": "maintenance",
  "folder.scan": "maintenance",
  "import.finalize": "maintenance",
  "ai.categorize": "maintenance",
  "intelligence.refresh": "maintenance",
  "reclassify.workspace": "maintenance",
  "pip.briefing": "maintenance",
  "maintenance.cleanup": "maintenance",
};

const DEFAULT_PRIORITY: Record<string, number> = {
  "repair.data": 10,
  "sync.post_process": 20,
  "sync.run": 30,
  "integrity.check": 40,
  "backup.check": 10,
  "folder.scan": 30,
  "import.finalize": 30,
  "ai.categorize": 50,
  "intelligence.refresh": 60,
  "reclassify.workspace": 60,
  "pip.briefing": 65,
  "maintenance.cleanup": 70,
};

const DEFAULT_MAX_ATTEMPTS: Record<string, number> = {
  "sync.run": 3,
  "sync.post_process": 5,
  "integrity.check": 3,
  "intelligence.refresh": 3,
};

export interface EnqueueResult {
  id: number;
  created: boolean;
}

function findIdempotent(workspaceId: number | null, type: string, key: string): number | null {
  const row =
    workspaceId == null
      ? (getDb()
          .prepare(
            "SELECT id FROM jobs WHERE workspace_id IS NULL AND type = ? AND idempotency_key = ?",
          )
          .get(type, key) as { id: number } | undefined)
      : (getDb()
          .prepare(
            "SELECT id FROM jobs WHERE workspace_id = ? AND type = ? AND idempotency_key = ?",
          )
          .get(workspaceId, type, key) as { id: number } | undefined);
  return row?.id ?? null;
}

/**
 * Inserts a job, or returns the existing one for the same (workspace, type, idempotency key).
 * `leaseOwner` creates it already leased so the manual SSE route can execute it inline while
 * the worker never claims it.
 */
export function enqueueJob(input: EnqueueJobInput): EnqueueResult {
  const type = input.type;
  const workspaceId = input.workspaceId ?? null;
  const lane = input.lane ?? DEFAULT_LANE[type] ?? "maintenance";
  const priority = input.priority ?? DEFAULT_PRIORITY[type] ?? 100;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS[type] ?? 5;
  const payloadJson = JSON.stringify(input.payload ?? {});
  const shadow = input.shadow ? 1 : 0;
  const now = Date.now();
  const runAfter = sqlTime(now + Math.max(0, input.delayMs ?? 0));
  const key = input.idempotencyKey ?? null;
  const db = getDb();

  return db
    .transaction(() => {
      if (key) {
        const existing = findIdempotent(workspaceId, type, key);
        if (existing != null) return { id: existing, created: false };
      }
      const leaseOwner = input.leaseOwner ?? null;
      const status: JobStatus = leaseOwner ? "leased" : "queued";
      const leaseExpires = leaseOwner ? sqlTimeAfter(input.leaseSeconds ?? 150, now) : null;
      const result = db
        .prepare(
          `INSERT INTO jobs
           (workspace_id, type, lane, idempotency_key, payload_json, status, priority, run_after,
            max_attempts, lease_owner, lease_expires_at, heartbeat_at, shadow)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          workspaceId,
          type,
          lane,
          key,
          payloadJson,
          status,
          priority,
          runAfter,
          maxAttempts,
          leaseOwner,
          leaseExpires,
          leaseOwner ? sqlTime(now) : null,
          shadow,
        );
      return { id: Number(result.lastInsertRowid), created: true };
    })
    .immediate();
}

export function getJob(id: number): JobRow | null {
  return (getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined) ?? null;
}

/** Makes an expired lease claimable again without counting a new attempt. */
export function requeueExpiredLeases(): number {
  const now = sqlTime();
  return getDb()
    .prepare(
      `UPDATE jobs
       SET status = 'queued', lease_owner = NULL, lease_expires_at = NULL,
           updated_at = datetime('now')
       WHERE status = 'leased' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?`,
    )
    .run(now).changes;
}

export function claimNextJob(lane: JobLane, owner: string, leaseSeconds = 150): JobRow | null {
  const db = getDb();
  return db
    .transaction(() => {
      requeueExpiredLeases();
      const now = sqlTime();
      const candidate = db
        .prepare(
          `SELECT * FROM jobs
         WHERE lane = ? AND status = 'queued' AND run_after <= ?
         ORDER BY priority ASC, run_after ASC, id ASC
         LIMIT 1`,
        )
        .get(lane, now) as JobRow | undefined;
      if (!candidate) return null;
      const claimed = db
        .prepare(
          `UPDATE jobs
         SET status = 'leased', lease_owner = ?, lease_expires_at = ?, heartbeat_at = ?,
             attempts = attempts + 1, updated_at = datetime('now')
         WHERE id = ? AND status = 'queued'`,
        )
        .run(owner, sqlTimeAfter(leaseSeconds), now, candidate.id);
      if (claimed.changes === 0) return null;
      const job = getJob(candidate.id);
      if (!job) return null;
      db.prepare(
        `INSERT OR REPLACE INTO job_attempts (job_id, attempt, started_at, status)
       VALUES (?, ?, ?, 'running')`,
      ).run(job.id, job.attempts, now);
      return job;
    })
    .immediate();
}

/** Claims a specific job (manual inline execution); validates and returns the existing lease. */
export function claimSpecificJob(id: number, owner: string, leaseSeconds = 300): JobRow | null {
  const db = getDb();
  return db
    .transaction(() => {
      const job = getJob(id);
      if (!job) return null;
      const now = sqlTime();
      if (job.status === "leased" && job.lease_owner === owner) {
        db.prepare(
          "UPDATE jobs SET lease_expires_at = ?, heartbeat_at = ?, updated_at = datetime('now') WHERE id = ?",
        ).run(sqlTimeAfter(leaseSeconds), now, id);
        return getJob(id);
      }
      const expired = job.lease_expires_at != null && job.lease_expires_at < now;
      if (job.status !== "queued" && !(job.status === "leased" && expired)) return null;
      const result = db
        .prepare(
          `UPDATE jobs
         SET status = 'leased', lease_owner = ?, lease_expires_at = ?, heartbeat_at = ?,
             attempts = attempts + 1, updated_at = datetime('now')
         WHERE id = ? AND (status = 'queued' OR (status = 'leased' AND lease_expires_at < ?))`,
        )
        .run(owner, sqlTimeAfter(leaseSeconds), now, id, now);
      if (result.changes === 0) return null;
      const claimed = getJob(id);
      if (claimed)
        db.prepare(
          `INSERT OR REPLACE INTO job_attempts (job_id, attempt, started_at, status)
         VALUES (?, ?, ?, 'running')`,
        ).run(claimed.id, claimed.attempts, now);
      return claimed;
    })
    .immediate();
}

export function heartbeatJob(id: number, owner: string, leaseSeconds = 150): boolean {
  return (
    getDb()
      .prepare(
        `UPDATE jobs SET lease_expires_at = ?, heartbeat_at = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'leased' AND lease_owner = ?`,
      )
      .run(sqlTimeAfter(leaseSeconds), sqlTime(), id, owner).changes > 0
  );
}

export function saveJobState(id: number, state: Record<string, unknown>): void {
  getDb()
    .prepare("UPDATE jobs SET state_json = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(state), id);
}

export function completeJob(id: number, owner: string): void {
  const db = getDb();
  db.transaction(() => {
    const job = getJob(id);
    if (!job) return;
    db.prepare(
      `UPDATE jobs
       SET status = 'succeeded', completed_at = datetime('now'), lease_owner = NULL,
           lease_expires_at = NULL, updated_at = datetime('now')
       WHERE id = ? AND status = 'leased' AND lease_owner = ?`,
    ).run(id, owner);
    db.prepare(
      `UPDATE job_attempts
       SET status = 'succeeded', finished_at = datetime('now'),
           duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER)
       WHERE job_id = ? AND attempt = ?`,
    ).run(id, job.attempts);
  })();
}

export interface FailJobInput {
  id: number;
  owner: string;
  errorCode: string;
  error: string;
  retryDelaysMs: number[];
  maxAttempts: number;
}

/** Returns the resulting state: `queued` with a backoff, or `dead` at the attempt cap. */
export function failJob(input: FailJobInput): JobStatus {
  const db = getDb();
  return db
    .transaction(() => {
      const job = getJob(input.id);
      if (!job) return "dead" as JobStatus;
      const dead = job.attempts >= input.maxAttempts;
      const delay = dead
        ? 0
        : (input.retryDelaysMs[job.attempts - 1] ?? input.retryDelaysMs.at(-1) ?? 60_000);
      db.prepare(
        `UPDATE jobs
       SET status = ?, run_after = ?, lease_owner = NULL, lease_expires_at = NULL,
           last_error_code = ?, last_error = ?, updated_at = datetime('now'),
           completed_at = CASE WHEN ? = 'dead' THEN datetime('now') ELSE NULL END
       WHERE id = ? AND status = 'leased' AND lease_owner = ?`,
      ).run(
        dead ? "dead" : "queued",
        sqlTime(Date.now() + delay),
        input.errorCode,
        input.error.slice(0, 2000),
        dead ? "dead" : "queued",
        input.id,
        input.owner,
      );
      db.prepare(
        `UPDATE job_attempts
       SET status = 'failed', finished_at = datetime('now'), error_code = ?,
           duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER)
       WHERE job_id = ? AND attempt = ?`,
      ).run(input.errorCode, input.id, job.attempts);
      return dead ? ("dead" as JobStatus) : ("queued" as JobStatus);
    })
    .immediate();
}

/** Graceful shutdown: a held lease returns to the queue immediately for the next process. */
export function releaseJobLease(id: number, owner: string): void {
  const db = getDb();
  db.transaction(() => {
    const job = getJob(id);
    if (!job) return;
    db.prepare(
      `UPDATE jobs
       SET status = 'queued', lease_owner = NULL, lease_expires_at = NULL, updated_at = datetime('now')
       WHERE id = ? AND status = 'leased' AND lease_owner = ?`,
    ).run(id, owner);
    db.prepare(
      "UPDATE job_attempts SET status = 'failed', finished_at = datetime('now'), error_code = 'shutdown' WHERE job_id = ? AND attempt = ?",
    ).run(id, job.attempts);
  })();
}

export function retryDeadJob(id: number): boolean {
  return (
    getDb()
      .prepare(
        `UPDATE jobs
         SET status = 'queued', attempts = 0, run_after = datetime('now'), lease_owner = NULL,
             lease_expires_at = NULL, last_error_code = NULL, last_error = NULL,
             completed_at = NULL, updated_at = datetime('now')
         WHERE id = ? AND status = 'dead'`,
      )
      .run(id).changes > 0
  );
}

export function cancelJob(id: number): boolean {
  return (
    getDb()
      .prepare(
        `UPDATE jobs
         SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL,
             completed_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND status IN ('queued', 'leased')`,
      )
      .run(id).changes > 0
  );
}

export function reconcileOrphanAttempts(): number {
  return getDb()
    .prepare(
      "UPDATE job_attempts SET status = 'failed', finished_at = datetime('now'), error_code = 'restart' WHERE status = 'running'",
    )
    .run().changes;
}

export interface QueueStats {
  byStatus: Record<string, number>;
  byLane: Record<string, number>;
  deadLetters: number;
}

export function queueStats(): QueueStats {
  const db = getDb();
  const rows = db
    .prepare("SELECT status, lane, COUNT(*) AS n FROM jobs GROUP BY status, lane")
    .all() as { status: string; lane: string; n: number }[];
  const byStatus: Record<string, number> = {};
  const byLane: Record<string, number> = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + row.n;
    byLane[row.lane] = (byLane[row.lane] ?? 0) + row.n;
  }
  return {
    byStatus,
    byLane,
    deadLetters: (
      db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'dead'").get() as { n: number }
    ).n,
  };
}

export function listDeadLetters(limit = 20): JobRow[] {
  return getDb()
    .prepare("SELECT * FROM jobs WHERE status = 'dead' ORDER BY updated_at DESC LIMIT ?")
    .all(limit) as JobRow[];
}
