import { handle, ApiError, readValidatedJson } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { isPipEnabled, pipProviderName } from "@/server/lib/pip-mode";
import { israelToday } from "@/server/lib/date-utils";
import { categoriesFact } from "@/server/pip/facts";
import { planTools } from "@/server/pip/planner";
import { PIP_TOOL_MAP } from "@/server/pip/tools";
import { hasConsent, listConsent } from "@/server/pip/repository";

export const dynamic = "force-dynamic";

const schema = z.object({
  question: z.string().trim().min(1).max(500),
  locale: z.enum(["he", "en"]).default("he"),
});

export const POST = handle("pip/what-sees", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  const body = await readValidatedJson(request, schema);
  const categories = categoriesFact(workspaceId).categories.map((category) => category.name);
  const plans = planTools({
    workspaceId,
    question: body.question,
    locale: body.locale,
    today: israelToday(),
    history: [],
    categoryNames: categories,
  });
  const provider = pipProviderName();
  const consent = listConsent(workspaceId);
  const providerAllowed =
    provider == null ? false : provider === "ollama" || hasConsent(workspaceId, provider);
  return NextResponse.json({
    tools: plans.map((plan) => {
      const tool = PIP_TOOL_MAP.get(plan.name);
      return {
        name: plan.name,
        description: tool?.description ?? "",
        riskTier: tool?.riskTier ?? "read",
        arguments: plan.args,
      };
    }),
    provider,
    consent,
    willSendFacts: providerAllowed,
    sendsRawRows: false,
    redaction: {
      accounts: "masked_to_last_4",
      transactions: "aggregated_or_top_rows",
      credentials: "never",
    },
  });
});
