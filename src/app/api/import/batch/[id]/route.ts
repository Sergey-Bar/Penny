import { ApiError, handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getAccount } from "@/server/db/queries/accounts";
import {
  getImportBatch,
  listImportBatchRows,
  resolveBatchId,
  deleteImportBatch,
} from "@/server/db/queries/imports";
import { requireImportEditor } from "@/server/lib/import/request";

type Context = { params: Promise<{ id: string }> };

async function readRef(context: Context): Promise<string> {
  const { id } = await context.params;
  const value = id.trim();
  if (!/^(batch-|sync-|sheet-)?\d+$/.test(value))
    throw new ApiError("invalid batch", 400, "notFound");
  return value;
}

/** GET /api/import/batch/:ref — status, counts, per-row reasons, account and undo availability. */
export const GET = handle("import/batch", async (request: Request, context: Context) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const id = resolveBatchId(workspaceId, await readRef(context));
  if (id == null) throw new ApiError("Batch not found", 404, "notFound");
  const batch = getImportBatch(workspaceId, id);
  if (!batch) throw new ApiError("Batch not found", 404, "notFound");
  return NextResponse.json({
    batch,
    account: batch.accountId == null ? null : getAccount(workspaceId, batch.accountId),
    rows: listImportBatchRows(workspaceId, id),
    canUndo: batch.status !== "undone",
  });
});

/** DELETE /api/import/batch/:ref?confirm=1 — safe undo; adopted rows are kept. */
export const DELETE = handle("import/batch", async (request: Request, context: Context) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  requireImportEditor(request, workspaceId);
  const url = new URL(request.url);
  if (url.searchParams.get("confirm") !== "1")
    throw new ApiError("confirm=1 is required", 400, "confirmRequired");
  const id = resolveBatchId(workspaceId, await readRef(context));
  if (id == null) throw new ApiError("Batch not found", 404, "notFound");
  return NextResponse.json(deleteImportBatch(workspaceId, id));
});
