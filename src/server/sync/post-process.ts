import "server-only";

import { getDb } from "@/server/db";
import { getAppSettings } from "@/server/db/queries/settings";
import { getUncategorizedIdsByKind } from "@/server/db/queries/transactions";
import { applyMerchantRulesToSyncRun } from "@/server/db/queries/excluded-merchants";
import { applyRulesToSyncRun } from "@/server/db/queries/rules";
import { applyAutomaticGoalRules } from "@/server/db/queries/financial-control";
import { markSyncPostProcessing } from "@/server/db/queries/sync-runs";
import { reconcileFlows } from "@/server/finance/pairing";
import { createAIProvider } from "@/server/ai/factory";
import { logError } from "@/server/lib/log";
import { israelToday } from "@/server/lib/date-utils";
import { categorizeLocally } from "./categorize-local";
import { enqueueJob } from "@/server/jobs/queue";

type PostProcessStep =
  "merchant-rules" | "rules" | "flow-pairing" | "local-categorization" | "goal-rules";

export interface PostProcessResult {
  stepsDone: PostProcessStep[];
  counts: Record<string, number>;
}

export interface PostProcessContext {
  workspaceId: number;
  syncRunId?: number | null;
  shadow: boolean;
  state: Record<string, unknown>;
  saveState: (patch: Record<string, unknown>) => void;
  emit: (event: string, data: Record<string, unknown>) => void;
}

function excludedMatches(workspaceId: number, syncRunId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM transactions t
       WHERE t.workspace_id = ? AND t.sync_run_id = ? AND t.is_excluded = 0
         AND EXISTS (
           SELECT 1 FROM excluded_merchants em
           WHERE em.workspace_id = t.workspace_id AND em.provider = t.provider
             AND em.merchant_key = COALESCE(t.merchant_key, t.description)
         )`,
    )
    .get(workspaceId, syncRunId) as { n: number };
  return row.n;
}

/**
 * Durable post-processing shared by the sync job and the manual SSE route. Steps checkpoint in
 * `state.stepsDone`, so an interrupted job resumes where it stopped.
 */
export function runPostProcess(context: PostProcessContext): PostProcessResult {
  const { workspaceId, syncRunId, shadow, state, saveState, emit } = context;
  const done = new Set<string>(Array.isArray(state.stepsDone) ? (state.stepsDone as string[]) : []);
  const counts: Record<string, number> = {
    ...((state.counts as Record<string, number> | undefined) ?? {}),
  };

  if (syncRunId != null && !shadow) markSyncPostProcessing(syncRunId, "running");

  const finish = (step: PostProcessStep, value: number) => {
    done.add(step);
    counts[step] = value;
    saveState({ stepsDone: [...done], counts });
    emit("post-process-step", { step, done: true });
  };

  const begin = (step: PostProcessStep) => {
    if (done.has(step)) return false;
    emit("post-process-step", { step, done: false });
    return true;
  };

  try {
    if (begin("merchant-rules")) {
      const value =
        shadow || syncRunId == null
          ? syncRunId == null
            ? 0
            : excludedMatches(workspaceId, syncRunId)
          : applyMerchantRulesToSyncRun(workspaceId, syncRunId);
      finish("merchant-rules", value);
    }

    if (begin("rules")) {
      const value = shadow || syncRunId == null ? 0 : applyRulesToSyncRun(workspaceId, syncRunId);
      finish("rules", value);
    }

    if (begin("flow-pairing")) {
      if (shadow) {
        // Counting candidates without writing would duplicate the pairing engine; shadow records
        // that the pass is deferred instead.
        finish("flow-pairing", 0);
      } else {
        const result = reconcileFlows(workspaceId);
        finish("flow-pairing", result.transfersPaired + result.refundsLinked + result.loansLinked);
      }
    }

    if (begin("local-categorization")) {
      // In shadow, computing without writing would require a dry-run engine; the count of
      // unresolved rows is the useful observable instead.
      const value = shadow
        ? getUncategorizedIdsByKind(workspaceId, "expense").length +
          getUncategorizedIdsByKind(workspaceId, "income").length
        : categorizeLocally(workspaceId);
      finish("local-categorization", value);
    }

    if (begin("goal-rules")) {
      if (!shadow) applyAutomaticGoalRules(workspaceId);
      finish("goal-rules", 0);
    }

    if (!shadow) {
      if (syncRunId != null) markSyncPostProcessing(syncRunId, "completed");
      auditShadow(workspaceId, syncRunId, counts, false);
      enqueueChildren(workspaceId);
    } else {
      auditShadow(workspaceId, syncRunId, counts, true);
    }

    return { stepsDone: [...done] as PostProcessStep[], counts };
  } catch (error) {
    if (!shadow && syncRunId != null) {
      const code = (error as { code?: unknown } | null)?.code;
      markSyncPostProcessing(syncRunId, "failed", typeof code === "string" ? code : "failed");
    }
    throw error;
  }
}

function auditShadow(
  workspaceId: number,
  syncRunId: number | null | undefined,
  counts: Record<string, number>,
  shadow: boolean,
): void {
  if (!shadow) return;
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_log
           (workspace_id, actor, action, entity_type, entity_id, after_json)
         VALUES (?, 'worker', 'sync.post_process.shadow', 'sync_runs', ?, ?)`,
      )
      .run(workspaceId, syncRunId == null ? null : String(syncRunId), JSON.stringify(counts));
  } catch (error) {
    logError("sync/post-process-audit", error);
  }
}

function enqueueChildren(workspaceId: number): void {
  try {
    const unresolved =
      getUncategorizedIdsByKind(workspaceId, "expense").length +
      getUncategorizedIdsByKind(workspaceId, "income").length;
    if (unresolved > 0) {
      const settings = getAppSettings(workspaceId);
      let configured = false;
      try {
        configured = createAIProvider() != null;
      } catch {
        configured = false;
      }
      if (configured && settings.aiProvider) {
        const bucket = new Date().toISOString().slice(0, 13);
        enqueueJob({
          workspaceId,
          type: "ai.categorize",
          idempotencyKey: `ai.categorize:${workspaceId}:${bucket}`,
          payload: { workspaceId },
        });
      }
    }
    const asOf = israelToday();
    enqueueJob({
      workspaceId,
      type: "intelligence.refresh",
      idempotencyKey: `intelligence.refresh:${workspaceId}:${asOf}`,
      payload: { workspaceId, asOf },
    });
  } catch (error) {
    // A child job is an optimization; post-processing itself already succeeded.
    logError("sync/post-process-children", error);
  }
}
