import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { listImportBatches } from "@/server/db/queries/imports";
import { requireImportEditor } from "@/server/lib/import/request";

/** GET /api/import/batches — import history with counts and the account label. */
export const GET = handle("import/batches", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  requireImportEditor(request, workspaceId);
  return NextResponse.json({ batches: listImportBatches(workspaceId) });
});
