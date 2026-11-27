import { handle, readValidatedJson } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { requireOpsAdmin } from "@/server/lib/ops-auth";
import { runPlannerEval } from "@/server/pip/eval";
import { saveEvalRun } from "@/server/pip/repository";

export const dynamic = "force-dynamic";

export const POST = handle("pip/eval", async (request: Request) => {
  requireOpsAdmin(request);
  const workspaceId = getWorkspaceIdFromRequest(request);
  await readValidatedJson(request, z.object({}));
  const report = runPlannerEval(workspaceId);
  saveEvalRun({
    workspaceId,
    suite: report.suite,
    total: report.total,
    passed: report.passed,
    failed: report.failed,
    payload: report,
  });
  return NextResponse.json(report);
});
