import { handle, readValidatedJson, ApiError } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { isPipEnabled } from "@/server/lib/pip-mode";
import { profileFromRequest } from "@/server/db/queries/profiles";
import { createThread, listThreads } from "@/server/pip/repository";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  locale: z.enum(["he", "en"]).default("he"),
});

export const GET = handle("pip/threads", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  return NextResponse.json({ threads: listThreads(workspaceId) });
});

export const POST = handle("pip/threads", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  const body = await readValidatedJson(request, schema);
  const profile = profileFromRequest(request, workspaceId);
  return NextResponse.json(
    createThread({
      workspaceId,
      profileId: profile?.id ?? null,
      locale: body.locale,
      title: body.title,
    }),
    { status: 201 },
  );
});
