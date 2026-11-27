import "server-only";

import { z } from "zod";
import { registerJobHandler } from "@/server/jobs/registry";
import { isPipEnabled } from "@/server/lib/pip-mode";
import { israelToday } from "@/server/lib/date-utils";
import { logEvent } from "@/server/lib/log";
import { buildBriefing, briefingText } from "@/server/pip/briefing";
import { hasBriefingDelivery, saveBriefing } from "@/server/pip/repository";

const payload = z.object({
  workspaceId: z.number().int().positive().optional(),
  asOf: z.string().min(1).max(40).optional(),
  channel: z.enum(["in_app", "telegram"]).optional(),
});

function requireWorkspace(
  payloadValue: Record<string, unknown>,
  jobWorkspace: number | null,
): number {
  const value = payloadValue.workspaceId ?? jobWorkspace;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw Object.assign(new Error("workspace is required"), {
      code: "workspace_missing",
      noRetry: true,
    });
  return value;
}

export function registerPipJobHandlers(): void {
  registerJobHandler("pip.briefing", {
    lane: "maintenance",
    priority: 65,
    maxAttempts: 3,
    retryDelaysMs: [5 * 60_000, 30 * 60_000, 120 * 60_000],
    payloadSchema: payload,
    async run(context) {
      const workspaceId = requireWorkspace(context.payload, context.job.workspace_id);
      if (!isPipEnabled(workspaceId)) {
        context.saveState({ skipped: "pip_disabled" });
        return;
      }
      const asOf = typeof context.payload.asOf === "string" ? context.payload.asOf : israelToday();
      if (context.shadow) {
        const briefing = buildBriefing({ workspaceId, locale: "he", today: asOf });
        context.saveState({ shadow: true, items: briefing.items.length });
        return;
      }
      const he = buildBriefing({ workspaceId, locale: "he", today: asOf });
      const en = buildBriefing({ workspaceId, locale: "en", today: asOf });
      saveBriefing({ workspaceId, asOf: he.asOf, locale: "he", briefing: he, channel: "in_app" });
      saveBriefing({ workspaceId, asOf: en.asOf, locale: "en", briefing: en, channel: "in_app" });
      context.saveState({ items: he.items.length, asOf: he.asOf });
      if (
        context.payload.channel !== "in_app" &&
        !hasBriefingDelivery(workspaceId, he.asOf, "telegram")
      ) {
        try {
          const bot = await import("@/server/bot/index");
          await bot.sendPipBriefing(workspaceId, briefingText(he, "he"));
          saveBriefing({
            workspaceId,
            asOf: he.asOf,
            locale: "he",
            briefing: he,
            channel: "telegram",
          });
        } catch (error) {
          logEvent("pip.briefing.telegram_failed", {
            workspaceId,
            message: error instanceof Error ? error.message : "unknown",
          });
        }
      }
      logEvent("pip.briefing", { workspaceId, asOf: he.asOf, items: he.items.length });
    },
  });
}
