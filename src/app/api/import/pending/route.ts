import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { listPendingFiles } from "@/server/db/queries/imports";
import { requireImportEditor } from "@/server/lib/import/request";

/** GET /api/import/pending — folder files waiting for a mapping (and the history of handled ones). */
export const GET = handle("import/pending", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  requireImportEditor(request, workspaceId);
  const status = new URL(request.url).searchParams.get("status");
  const allowed =
    status === "all" || status === "ignored" || status === "imported" || status === "failed";
  return NextResponse.json({
    files: listPendingFiles(
      workspaceId,
      allowed ? (status as "all" | "ignored" | "imported" | "failed") : "pending",
    ),
  });
});
