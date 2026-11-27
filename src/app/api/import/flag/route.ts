import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { importV2Enabled, setImportV2 } from "@/server/lib/import/flag";
import { requireImportEditor, readBody } from "@/server/lib/import/request";

/** GET /api/import/flag — whether the workspace sees the v2 workbench. */
export const GET = handle("import/flag", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json({ enabled: importV2Enabled(workspaceId) });
});

/** PUT /api/import/flag { enabled } — opt in/out of the v2 workbench. */
export const PUT = handle("import/flag", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  requireImportEditor(request, workspaceId);
  const body = await readBody<{ enabled?: boolean }>(request);
  setImportV2(workspaceId, body.enabled === true);
  return NextResponse.json({ enabled: importV2Enabled(workspaceId) });
});
