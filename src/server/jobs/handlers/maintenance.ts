import "server-only";

import { z } from "zod";
import { registerJobHandler } from "@/server/jobs/registry";
import { getDb } from "@/server/db";
import { checkIntegrity, repairIntegrity } from "@/server/finance/integrity";
import { runHourlySnapshot } from "@/server/lib/hourly-backup";
import { backupDue, getAutoBackupConfig, runAutoBackup } from "@/server/lib/auto-backup";
import { pruneIdempotencyKeys } from "@/server/lib/http/idempotency";
import { pruneExpiredLocks } from "@/server/jobs/locks";
import { logEvent } from "@/server/lib/log";
import { prunePipRetention } from "@/server/pip/repository";

const workspacePayload = z.object({
  workspaceId: z.number().int().positive().optional(),
});

function workspaceFrom(
  payload: Record<string, unknown>,
  jobWorkspace: number | null,
): number | null {
  const value = payload.workspaceId ?? jobWorkspace;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function registerMaintenanceJobHandlers(): void {
  registerJobHandler("backup.check", {
    lane: "maintenance",
    priority: 10,
    maxAttempts: 3,
    retryDelaysMs: [15_000, 60_000, 300_000],
    payloadSchema: z.object({}),
    async run(context) {
      const local = runHourlySnapshot();
      const config = getAutoBackupConfig();
      let portable: "ok" | "due" | "locked" | "disabled" | "error" = "disabled";
      if (config.enabled) {
        if (config.status === "locked") portable = "locked";
        else if (backupDue(config.status === "ok" ? config.lastAt : null, config.frequency)) {
          const result = runAutoBackup();
          portable =
            result.status === "ok" ? "ok" : result.status === "locked" ? "locked" : "error";
        } else portable = "ok";
      }
      context.saveState({ local: local.status, portable, checkedAt: new Date().toISOString() });
      logEvent("backup.check", { local: local.status, portable });
    },
  });

  registerJobHandler("integrity.check", {
    lane: "critical",
    priority: 40,
    maxAttempts: 3,
    retryDelaysMs: [5 * 60_000, 30 * 60_000, 120 * 60_000],
    payloadSchema: workspacePayload,
    async run(context) {
      const workspaceId = workspaceFrom(context.payload, context.job.workspace_id);
      const report = checkIntegrity(workspaceId);
      context.saveState({ report });
      if (!context.shadow && !report.ok) {
        context.emit("integrity-suggestions", { report });
      }
      logEvent("integrity.check", {
        workspaceId: workspaceId ?? "all",
        ok: report.ok,
        foreignKeys: report.foreignKeyViolations,
        duplicates: report.duplicateGroups,
        splits: report.splitSumMismatches,
      });
    },
  });

  registerJobHandler("repair.data", {
    lane: "critical",
    priority: 10,
    maxAttempts: 3,
    retryDelaysMs: [15_000, 60_000, 300_000],
    payloadSchema: workspacePayload,
    async run(context) {
      const workspaceId = workspaceFrom(context.payload, context.job.workspace_id);
      if (context.shadow) {
        const report = checkIntegrity(workspaceId);
        context.saveState({ shadowReport: report });
        return;
      }
      const repaired = repairIntegrity(workspaceId);
      context.saveState({ repaired });
      logEvent("integrity.repair", {
        workspaceId: workspaceId ?? "all",
        accountIds: repaired.accountIds,
        categoryClears: repaired.categoryClears,
        stalePending: repaired.stalePending,
      });
    },
  });

  registerJobHandler("maintenance.cleanup", {
    lane: "maintenance",
    priority: 70,
    maxAttempts: 3,
    retryDelaysMs: [15_000, 60_000, 300_000],
    payloadSchema: z.object({}),
    async run(context) {
      const db = getDb();
      const pip = prunePipRetention();
      const pruned = {
        idempotency: pruneIdempotencyKeys(),
        locks: pruneExpiredLocks(),
        pipMessages: pip.messages,
        pipMemory: pip.memory,
        pipRuns: pip.runs,
        pipBriefings: pip.briefings,
        pipEvaluations: pip.evaluations,
        metrics: db.prepare("DELETE FROM metrics_daily WHERE day < date('now', '-90 days')").run()
          .changes,
        audit: db
          .prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-180 days')")
          .run().changes,
        jobs: db
          .prepare(
            `DELETE FROM jobs
             WHERE status IN ('succeeded', 'cancelled')
               AND completed_at IS NOT NULL
               AND completed_at < datetime('now', '-7 days')`,
          )
          .run().changes,
      };
      context.saveState({ pruned });
      logEvent("maintenance.cleanup", pruned);
    },
  });
}
