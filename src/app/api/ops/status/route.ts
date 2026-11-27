import "server-only";

import fs from "node:fs";
import { NextResponse } from "next/server";
import { handle } from "@/server/lib/api-error";
import { requireOpsAdmin } from "@/server/lib/ops-auth";
import { getDb } from "@/server/db";
import { dbPath, dataDir } from "@/server/lib/data-dir";
import { getGlobalSetting } from "@/server/db/queries/settings";
import { latestSyncStartMs } from "@/server/db/queries/sync-runs";
import { getNextRunAt } from "@/server/sync/scheduler";
import { workerStatus } from "@/server/jobs/worker";
import { queueStats, listDeadLetters } from "@/server/jobs/queue";
import { getLock } from "@/server/jobs/locks";
import { hourlyBackupStatus } from "@/server/lib/hourly-backup";
import { getAutoBackupConfig } from "@/server/lib/auto-backup";
import { isKeyLocked } from "@/server/lib/encryption";
import { isBackendActive, getBackendMode } from "@/server/lib/backend-mode";
import { readErrorLog } from "@/server/lib/log";
import { providerHealth } from "@/server/sync/provider-health";
import { getPipMode, isPipKillSwitch, pipProviderName } from "@/server/lib/pip-mode";

export const dynamic = "force-dynamic";

export const GET = handle("ops/status", async (request: Request) => {
  requireOpsAdmin(request);
  const db = getDb();
  const migrations = db
    .prepare("SELECT name, applied_at AS appliedAt FROM _migrations ORDER BY name")
    .all() as { name: string; appliedAt: string }[];
  const quickCheck = db.pragma("quick_check", { simple: true });
  const foreignKeys = (db.pragma("foreign_key_check") as unknown[]).length;
  const wal = fs.existsSync(`${dbPath()}-wal`) ? fs.statSync(`${dbPath()}-wal`).size : 0;
  const queue = queueStats();
  const local = hourlyBackupStatus();
  const portable = getAutoBackupConfig();
  const worker = workerStatus();
  const workspaces = db.prepare("SELECT id FROM workspaces ORDER BY id").all() as { id: number }[];
  const latestSyncs = db
    .prepare(
      `SELECT workspace_id AS workspaceId, provider, status,
              post_processing_status AS postProcessingStatus, completed_at AS completedAt,
              error_message AS errorMessage
       FROM sync_runs
       WHERE id IN (SELECT MAX(id) FROM sync_runs GROUP BY workspace_id)`,
    )
    .all() as {
    workspaceId: number;
    provider: string;
    status: string;
    postProcessingStatus: string | null;
    completedAt: string | null;
    errorMessage: string | null;
  }[];
  const latestByWorkspace = new Map(latestSyncs.map((row) => [row.workspaceId, row]));
  const disk = (() => {
    try {
      const stats = fs.statfsSync(dataDir());
      return {
        freeBytes: Number(stats.bavail) * Number(stats.bsize),
        totalBytes: Number(stats.blocks) * Number(stats.bsize),
      };
    } catch {
      return null;
    }
  })();

  const recentErrors = readErrorLog(50)
    .map(({ at, scope, code }) => ({ at, scope, code }))
    .slice(-20);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    mode: getBackendMode(),
    active: isBackendActive(),
    migrations: {
      applied: migrations.length,
      latest: migrations.at(-1) ?? null,
      recent: migrations.slice(-3),
    },
    database: {
      quickCheck,
      foreignKeyViolations: foreignKeys,
      sizeBytes: fs.existsSync(dbPath()) ? fs.statSync(dbPath()).size : 0,
      walBytes: wal,
      busyTimeoutMs: db.pragma("busy_timeout", { simple: true }),
      journalMode: db.pragma("journal_mode", { simple: true }),
    },
    worker: {
      ...worker,
      lock: getLock("worker"),
    },
    lock: {
      sync: getLock("sync"),
      appLocked: isKeyLocked(),
    },
    queue: {
      depth: (queue.byStatus.queued ?? 0) + (queue.byStatus.leased ?? 0),
      byStatus: queue.byStatus,
      byLane: queue.byLane,
      deadLetters: queue.deadLetters,
      dead: listDeadLetters(10).map((job) => ({
        id: job.id,
        type: job.type,
        workspaceId: job.workspace_id,
        attempts: job.attempts,
        lastErrorCode: job.last_error_code,
        updatedAt: job.updated_at,
      })),
    },
    scheduler: {
      enabled: getGlobalSetting("auto_sync_enabled") !== "false",
      nextRunAt: getNextRunAt(),
      lastAttemptMs: Number(getGlobalSetting("auto_sync_last_attempt")) || null,
      lastSyncStartMs: latestSyncStartMs(),
    },
    pip: (() => {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS runs,
                  SUM(CASE WHEN status = 'fallback' THEN 1 ELSE 0 END) AS fallbacks,
                  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
                  MAX(created_at) AS lastAt
           FROM pip_agent_runs WHERE created_at >= datetime('now', '-7 days')`,
        )
        .get() as {
        runs: number;
        fallbacks: number | null;
        failed: number | null;
        lastAt: string | null;
      };
      return {
        mode: getPipMode(),
        killSwitch: isPipKillSwitch(),
        provider: pipProviderName(),
        runs7d: row.runs,
        fallbacks7d: row.fallbacks ?? 0,
        failed7d: row.failed ?? 0,
        lastRunAt: row.lastAt,
      };
    })(),
    backups: {
      local: {
        status: local.status,
        at: local.at,
        ageSeconds: local.ageSeconds,
        count: local.count,
      },
      portable: {
        enabled: portable.enabled,
        frequency: portable.frequency,
        lastAt: portable.lastAt,
        status: portable.status,
        error: portable.error,
      },
      rpo: { localSeconds: 3600, offsiteSeconds: 86_400 },
      rtoSeconds: 600,
    },
    workspaces: workspaces.map((workspace) => ({
      id: workspace.id,
      mode: getBackendMode(workspace.id),
      providers: providerHealth(workspace.id),
      latestSync: latestByWorkspace.get(workspace.id) ?? null,
    })),
    disk,
    recentErrorCodes: recentErrors,
  });
});
