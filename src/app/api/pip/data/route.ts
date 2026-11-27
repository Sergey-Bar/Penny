import { handle, ApiError, readValidatedJson } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { isPipEnabled } from "@/server/lib/pip-mode";
import { israelToday } from "@/server/lib/date-utils";
import { exportPipData, wipePipData } from "@/server/pip/repository";

export const dynamic = "force-dynamic";

const wipeSchema = z.object({ confirm: z.literal("delete-pip-history") });

export const GET = handle("pip/data", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  const data = exportPipData(workspaceId);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="penny-pip-${israelToday()}.json"`,
      "Cache-Control": "no-store",
    },
  });
});

export const DELETE = handle("pip/data", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  await readValidatedJson(request, wipeSchema);
  wipePipData(workspaceId);
  return NextResponse.json({ ok: true });
});
