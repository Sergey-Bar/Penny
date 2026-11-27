import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getAppSettings } from "@/server/db/queries/settings";
import { previewImport } from "@/server/lib/import/preview";
import {
  assertBodySize,
  coerceNormalizedRows,
  requireImportEditor,
  readBody,
} from "@/server/lib/import/request";
import { ApiError } from "@/server/lib/api-error";

/** POST /api/import/preview — one status and category suggestion per row, no writes. */
export const POST = handle("import/preview", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  requireImportEditor(request, workspaceId);
  assertBodySize(request);
  const body = await readBody<{ accountId?: number; rows?: unknown }>(request);
  if (typeof body.accountId !== "number" || !Number.isInteger(body.accountId))
    throw new ApiError("account is required", 400, "accountMissing");
  const rows = coerceNormalizedRows(body.rows);
  const members = getAppSettings(workspaceId).household.members.map((m) => m.id);
  return NextResponse.json(previewImport(workspaceId, body.accountId, rows, { members }));
});
