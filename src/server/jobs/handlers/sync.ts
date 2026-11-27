import "server-only";

import { z } from "zod";
import { registerJobHandler } from "@/server/jobs/registry";
import { tryAcquireSync } from "@/server/sync/lock";
import { isProviderCoolingDown } from "@/server/sync/provider-health";
import { syncWorkspace } from "@/server/sync/orchestrator";
import { runPostProcess } from "@/server/sync/post-process";
import { logEvent } from "@/server/lib/log";

const syncRunPayload = z.object({
  workspaceId: z.number().int().positive().optional(),
  credentialId: z.number().int().positive().optional(),
});

const postProcessPayload = z.object({
  workspaceId: z.number().int().positive().optional(),
  syncRunId: z.number().int().positive().optional(),
});

function workspaceFrom(context: {
  job: { workspace_id: number | null };
  payload: Record<string, unknown>;
}): number {
  const value = context.payload.workspaceId ?? context.job.workspace_id;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw Object.assign(new Error("workspace is required"), {
      code: "workspace_missing",
      noRetry: true,
    });
  return value;
}

export function registerSyncJobHandlers(): void {
  registerJobHandler("sync.run", {
    lane: "critical",
    priority: 30,
    maxAttempts: 3,
    retryDelaysMs: [15 * 60_000, 60 * 60_000, 4 * 60 * 60_000],
    payloadSchema: syncRunPayload,
    async run(context) {
      const workspaceId = workspaceFrom(context);
      const credentialId =
        typeof context.payload.credentialId === "number" ? context.payload.credentialId : undefined;
      if (credentialId != null && isProviderCoolingDown(workspaceId, credentialId)) {
        context.emit("provider-skipped", { workspaceId, credentialId, reason: "cooldown" });
        logEvent("sync.skip", { workspaceId, credentialId, reason: "cooldown" });
        return;
      }

      const since = new Date().toISOString().slice(0, 19).replace("T", " ");
      const lease = tryAcquireSync("scheduled", 300);
      if (!lease) {
        throw Object.assign(new Error("A sync is already running"), { code: "sync_busy" });
      }
      try {
        const summary = await syncWorkspace(
          workspaceId,
          credentialId,
          (event, data) => context.emit(event, data),
          false,
          { mode: "enqueue" },
        );
        const failed = summary.providers.find((provider) => !provider.ok);
        context.saveState({
          syncRunIds: summary.postProcessJobs.map((job) => job.syncRunId),
          postProcessJobIds: summary.postProcessJobs.map((job) => job.jobId),
          added: summary.added,
          updated: summary.updated,
        });
        // Telegram feedback must never fail or slow the sync itself.
        void import("@/server/bot/index")
          .then(async (bot) => {
            await bot.sendSpendFeedback(since);
            await bot.sendSyncAlerts(summary.providers);
          })
          .catch((error) =>
            logEvent("sync.alerts_failed", {
              workspaceId,
              message: error instanceof Error ? error.message : "unknown",
            }),
          );
        if (failed) {
          const error = new Error(failed.errorMessage ?? "Sync failed") as Error & {
            code?: string;
            noRetry?: boolean;
          };
          error.code = failed.errorCode ?? "sync_failed";
          error.noRetry =
            failed.retryable === false ||
            ["auth", "two_factor", "site_changed"].includes(error.code);
          throw error;
        }
      } finally {
        lease();
      }
    },
  });

  registerJobHandler("sync.post_process", {
    lane: "critical",
    priority: 20,
    maxAttempts: 5,
    retryDelaysMs: [60_000, 5 * 60_000, 30 * 60_000],
    payloadSchema: postProcessPayload,
    async run(context) {
      const workspaceId = workspaceFrom(context);
      const syncRunId =
        typeof context.payload.syncRunId === "number" ? context.payload.syncRunId : null;
      const result = runPostProcess({
        workspaceId,
        syncRunId,
        shadow: context.shadow,
        state: context.state,
        saveState: context.saveState,
        emit: context.emit,
      });
      context.saveState({
        stepsDone: result.stepsDone,
        counts: result.counts,
        savedAt: new Date().toISOString(),
      });
    },
  });
}
