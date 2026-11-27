import { ApiError, handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { resolveBatchId } from "@/server/db/queries/imports";
import { reclassifyAccount, reclassifyBatch } from "@/server/lib/import/reclassify";
import { readBody, requireImportEditor } from "@/server/lib/import/request";

/** POST /api/import/batch/:id/reclassify — re-runs patterns without touching confirmed rows. */
export const POST = handle(
  "import/reclassify",
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const workspaceId = getWorkspaceIdFromRequest(request);
    requireImportEditor(request, workspaceId);
    const { id } = await context.params;
    await readBody<Record<string, unknown>>(request);
    const value = Number(id);
    if (!Number.isInteger(value) || value <= 0)
      throw new ApiError("invalid batch", 400, "notFound");
    const batchId = resolveBatchId(workspaceId, value);
    const result =
      batchId != null
        ? reclassifyBatch(workspaceId, batchId)
        : reclassifyAccount(workspaceId, value);
    return NextResponse.json(result);
  },
);
