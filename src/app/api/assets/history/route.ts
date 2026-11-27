import { NextResponse } from "next/server";
import { handle } from "@/server/lib/api-error";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getAssetHistoryPayload } from "@/server/db/queries/assets";

export const dynamic = "force-dynamic";

export const GET = handle("assets-history", async (request: Request) => {
  return NextResponse.json(getAssetHistoryPayload(getWorkspaceIdFromRequest(request)));
});
