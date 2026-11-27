import { ApiError, handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getPendingFile } from "@/server/db/queries/imports";
import { ignorePending, parsePending, retryPending } from "@/server/lib/import/pending";
import { requireImportEditor, readBody } from "@/server/lib/import/request";

type Action = "import" | "open" | "ignore" | "retry";

/** POST /api/import/pending/:id — open/import (parse into the workbench), ignore, retry. */
export const POST = handle(
  "import/pending/action",
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const workspaceId = getWorkspaceIdFromRequest(request);
    requireImportEditor(request, workspaceId);
    const { id } = await context.params;
    const pendingId = Number(id);
    if (!Number.isInteger(pendingId) || pendingId <= 0)
      throw new ApiError("invalid id", 400, "notFound");
    if (!getPendingFile(workspaceId, pendingId))
      throw new ApiError("Pending file not found", 404, "notFound");
    const body = await readBody<{ action?: Action; sheetName?: string; headerRow?: number }>(
      request,
    );
    const action = body.action ?? "open";
    if (action === "ignore") {
      await ignorePending(workspaceId, pendingId);
      return NextResponse.json({ ok: true, status: "ignored" });
    }
    if (action === "retry") {
      retryPending(workspaceId, pendingId);
      return NextResponse.json({ ok: true, status: "pending" });
    }
    const parsed = await parsePending(workspaceId, pendingId, {
      sheetName: body.sheetName ?? null,
      headerRow: body.headerRow ?? null,
    });
    return NextResponse.json({ ...parsed, pendingId });
  },
);
