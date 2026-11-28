import { ApiError, handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { listImportProfileRows, putImportProfileRow } from "@/server/db/queries/imports";
import { importProfileKey, parseImportProfile, type ImportProfileV2 } from "@/lib/import/profile";
import { requireImportEditor, readBody } from "@/server/lib/import/request";

/** GET /api/import/profiles — mapping profiles stored per workspace, not per browser. */
export const GET = handle("import/profiles", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json({
    profiles: listImportProfileRows(workspaceId)
      .map((row) => parseImportProfile(row.json))
      .filter((profile): profile is ImportProfileV2 => profile != null),
  });
});

/** PUT /api/import/profiles { profile } — save/replace by format + sheet + header fingerprint. */
export const PUT = handle("import/profiles", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  requireImportEditor(request, workspaceId);
  const body = await readBody<{ profile?: unknown }>(request);
  const parsed = body.profile == null ? null : parseImportProfile(JSON.stringify(body.profile));
  if (!parsed || parsed.version !== 2) throw new ApiError("profile is required", 400, "bad_json");
  const key = importProfileKey(parsed);
  putImportProfileRow(workspaceId, key, JSON.stringify(parsed));
  return NextResponse.json({ ok: true, key });
});
