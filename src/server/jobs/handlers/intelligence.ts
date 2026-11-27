import "server-only";

import { z } from "zod";
import { registerJobHandler } from "@/server/jobs/registry";
import { getDb } from "@/server/db";
import { categorizeWithAI } from "@/server/sync/ai-categorize";
import { reclassifyWorkspace } from "@/server/lib/import/reclassify";
import { loadInsights } from "@/server/insights/data";
import { israelToday } from "@/server/lib/date-utils";
import { logEvent } from "@/server/lib/log";

const workspacePayload = z.object({
  workspaceId: z.number().int().positive().optional(),
  asOf: z.string().min(1).max(40).optional(),
});

function requireWorkspace(payload: Record<string, unknown>, jobWorkspace: number | null): number {
  const value = payload.workspaceId ?? jobWorkspace;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw Object.assign(new Error("workspace is required"), {
      code: "workspace_missing",
      noRetry: true,
    });
  return value;
}

export function registerIntelligenceJobHandlers(): void {
  registerJobHandler("reclassify.workspace", {
    lane: "maintenance",
    priority: 60,
    maxAttempts: 3,
    retryDelaysMs: [5 * 60_000, 30 * 60_000, 120 * 60_000],
    payloadSchema: workspacePayload,
    async run(context) {
      const workspaceId = requireWorkspace(context.payload, context.job.workspace_id);
      if (context.shadow) {
        context.saveState({ shadow: true });
        return;
      }
      const result = reclassifyWorkspace(workspaceId);
      context.saveState(result);
      logEvent("reclassify.workspace", { workspaceId, ...result });
    },
  });

  registerJobHandler("ai.categorize", {
    lane: "maintenance",
    priority: 50,
    maxAttempts: 5,
    retryDelaysMs: [15_000, 60_000, 300_000],
    payloadSchema: workspacePayload,
    async run(context) {
      const workspaceId = requireWorkspace(context.payload, context.job.workspace_id);
      if (context.shadow) {
        context.saveState({ shadow: true });
        return;
      }
      const result = await categorizeWithAI(
        workspaceId,
        typeof context.payload.maxBatches === "number" ? context.payload.maxBatches : 8,
      );
      context.saveState({ ...result });
      if (result.warning)
        logEvent("ai.categorize.warning", { workspaceId, warning: result.warning });
    },
  });

  registerJobHandler("intelligence.refresh", {
    lane: "maintenance",
    priority: 60,
    maxAttempts: 3,
    retryDelaysMs: [5 * 60_000, 30 * 60_000, 120 * 60_000],
    payloadSchema: workspacePayload,
    async run(context) {
      const workspaceId = requireWorkspace(context.payload, context.job.workspace_id);
      const asOf = typeof context.payload.asOf === "string" ? context.payload.asOf : israelToday();
      if (context.shadow) {
        context.saveState({ shadow: true });
        return;
      }
      const insights = loadInsights(workspaceId, israelToday());
      const db = getDb();
      db.prepare(
        `INSERT INTO insight_snapshots (workspace_id, kind, as_of, payload_json)
         VALUES (?, 'insights', ?, ?)
         ON CONFLICT(workspace_id, kind, as_of) DO UPDATE SET
           payload_json = excluded.payload_json, created_at = datetime('now')`,
      ).run(workspaceId, asOf, JSON.stringify(insights));
      db.prepare(
        `DELETE FROM insight_snapshots
         WHERE workspace_id = ? AND kind = 'insights'
           AND as_of NOT IN (
             SELECT as_of FROM insight_snapshots
             WHERE workspace_id = ? AND kind = 'insights'
             ORDER BY as_of DESC LIMIT 7
           )`,
      ).run(workspaceId, workspaceId);
      context.saveState({ asOf });
    },
  });
}
