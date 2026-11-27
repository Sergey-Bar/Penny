import { ApiError, handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { deleteImportBatch, findGroupBatch, listGroupBatches } from "@/server/db/queries/imports";
import { requireImportEditor } from "@/server/lib/import/request";

type Context = { params: Promise<{ groupId: string }> };

/** GET /api/import/group/:groupId — every chunk of a large file. */
export const GET = handle("import/group", async (request: Request, context: Context) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { groupId } = await context.params;
  const batches = listGroupBatches(workspaceId, groupId);
  if (batches.length === 0) throw new ApiError("Group not found", 404, "notFound");
  return NextResponse.json({ groupId, batches });
});

/** DELETE /api/import/group/:groupId?confirm=1 — one undo for all chunks. */
export const DELETE = handle("import/group", async (request: Request, context: Context) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  requireImportEditor(request, workspaceId);
  if (new URL(request.url).searchParams.get("confirm") !== "1")
    throw new ApiError("confirm=1 is required", 400, "confirmRequired");
  const { groupId } = await context.params;
  const first = findGroupBatch(workspaceId, groupId);
  if (!first) throw new ApiError("Group not found", 404, "notFound");
  return NextResponse.json(deleteImportBatch(workspaceId, first.id, { group: true }));
});
