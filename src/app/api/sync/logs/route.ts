import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { writeAudit } from "@/server/audit/audit";
import { clearAllSyncLogs, listAllSyncLogs } from "@/server/pension/sync";

export const dynamic = "force-dynamic";

export const GET = handle("sync/logs", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json({ logs: listAllSyncLogs(workspaceId) });
});

export const DELETE = handle("sync/logs", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const removed = clearAllSyncLogs(workspaceId);
  writeAudit({
    workspaceId,
    actor: "local",
    action: "sync.logs.clear",
    entityType: "sync_logs",
    after: { removed },
  });
  return NextResponse.json({ ok: true });
});
