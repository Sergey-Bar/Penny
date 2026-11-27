import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getParsePage } from "@/server/lib/import/parse";
import { requireImportEditor } from "@/server/lib/import/request";

/** GET /api/import/parse/:parseId?offset=&limit= — another page of the same parsed table. */
export const GET = handle(
  "import/parse/page",
  async (request: Request, context: { params: Promise<{ parseId: string }> }) => {
    const workspaceId = getWorkspaceIdFromRequest(request);
    requireImportEditor(request, workspaceId);
    const { parseId } = await context.params;
    const url = new URL(request.url);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 200);
    return NextResponse.json(
      getParsePage(
        parseId,
        workspaceId,
        Number.isFinite(offset) ? offset : 0,
        Number.isFinite(limit) ? limit : 200,
      ),
    );
  },
);
