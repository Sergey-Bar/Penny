import { handle, ApiError, readValidatedJson } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { isPipEnabled } from "@/server/lib/pip-mode";
import { israelToday } from "@/server/lib/date-utils";
import { buildBriefing } from "@/server/pip/briefing";
import { latestBriefing, saveBriefing, setBriefingFeedback } from "@/server/pip/repository";
import type { PipLocale } from "@/lib/pip";

export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  asOf: z.string().min(1).max(40),
  locale: z.enum(["he", "en"]).default("he"),
  feedback: z.enum(["helpful", "not_helpful", "acted", "dismissed"]),
});

function localeOf(request: Request): PipLocale {
  return new URL(request.url).searchParams.get("locale") === "en" ? "en" : "he";
}

export const GET = handle("pip/briefing", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  const locale = localeOf(request);
  const existing = latestBriefing(workspaceId, locale);
  if (existing) return NextResponse.json(existing);
  const briefing = buildBriefing({ workspaceId, locale, today: israelToday() });
  saveBriefing({ workspaceId, asOf: briefing.asOf, locale, briefing });
  return NextResponse.json(briefing);
});

export const POST = handle("pip/briefing", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  const locale = localeOf(request);
  const briefing = buildBriefing({ workspaceId, locale, today: israelToday() });
  saveBriefing({ workspaceId, asOf: briefing.asOf, locale, briefing });
  return NextResponse.json(briefing);
});

export const PUT = handle("pip/briefing", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  const body = await readValidatedJson(request, feedbackSchema);
  setBriefingFeedback({
    workspaceId,
    asOf: body.asOf,
    locale: body.locale,
    feedback: body.feedback,
  });
  return NextResponse.json({ ok: true });
});
