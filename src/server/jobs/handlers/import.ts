import "server-only";

import { z } from "zod";
import { registerJobHandler } from "@/server/jobs/registry";
import { getDb } from "@/server/db";
import { reclassifyBatch } from "@/server/lib/import/reclassify";
import { categorizeLocally } from "@/server/sync/categorize-local";
import { markSyncPostProcessing } from "@/server/db/queries/sync-runs";
import { scanImportFolder } from "@/server/lib/folder-import";
import { logEvent } from "@/server/lib/log";

const finalizePayload = z.object({
  workspaceId: z.number().int().positive().optional(),
  batchId: z.number().int().positive(),
});

const scanPayload = z.object({
  workspaceId: z.number().int().positive().optional(),
  bucket: z.string().min(1).max(40).optional(),
});

function workspaceFrom(payload: Record<string, unknown>, jobWorkspace: number | null): number {
  const value = payload.workspaceId ?? jobWorkspace;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw Object.assign(new Error("workspace is required"), {
      code: "workspace_missing",
      noRetry: true,
    });
  return value;
}

export function registerImportJobHandlers(): void {
  registerJobHandler("import.finalize", {
    lane: "maintenance",
    priority: 30,
    maxAttempts: 5,
    retryDelaysMs: [15_000, 60_000, 300_000],
    payloadSchema: finalizePayload,
    async run(context) {
      const workspaceId = workspaceFrom(context.payload, context.job.workspace_id);
      const batchId = Number(context.payload.batchId);
      const run = getDb()
        .prepare(
          "SELECT sync_run_id AS syncRunId FROM import_batches WHERE workspace_id = ? AND id = ?",
        )
        .get(workspaceId, batchId) as { syncRunId: number | null } | undefined;
      if (context.shadow) {
        context.saveState({ shadow: true, batchId });
        return;
      }
      const reclassified = reclassifyBatch(workspaceId, batchId);
      const categorized = categorizeLocally(workspaceId);
      if (run?.syncRunId != null) markSyncPostProcessing(run.syncRunId, "completed");
      context.saveState({ reclassified, categorized, batchId });
      logEvent("import.finalize", {
        workspaceId,
        batchId,
        changed: reclassified.changed,
        categorized,
      });
    },
  });

  registerJobHandler("folder.scan", {
    lane: "maintenance",
    priority: 30,
    maxAttempts: 3,
    retryDelaysMs: [60_000, 300_000, 900_000],
    payloadSchema: scanPayload,
    async run(context) {
      if (context.shadow) {
        context.saveState({ shadow: true });
        return;
      }
      const config = await scanImportFolder();
      context.saveState({ status: config.status, at: new Date().toISOString() });
    },
  });
}
