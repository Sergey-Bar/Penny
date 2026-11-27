import { handle, ApiError, readValidatedJson } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { isPipEnabled } from "@/server/lib/pip-mode";
import { listConsent, setConsent } from "@/server/pip/repository";
import { PIP_PROVIDER_SCOPES } from "@/lib/pip";

export const dynamic = "force-dynamic";

const schema = z.object({
  provider: z.enum(["claude", "ollama", "codex", "gemini", "opencode", "kilo"]),
  scopes: z.array(z.enum(PIP_PROVIDER_SCOPES)).max(10),
  granted: z.boolean(),
});

export const GET = handle("pip/consent", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  return NextResponse.json({ consent: listConsent(workspaceId) });
});

export const PUT = handle("pip/consent", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  const body = await readValidatedJson(request, schema);
  setConsent({
    workspaceId,
    provider: body.provider,
    scopes: body.scopes,
    granted: body.granted,
  });
  return NextResponse.json({ consent: listConsent(workspaceId) });
});
